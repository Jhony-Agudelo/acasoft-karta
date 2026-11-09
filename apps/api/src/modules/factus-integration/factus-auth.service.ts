import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FactusCryptoService } from './factus-crypto.service';

interface CachedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // timestamp ms
  baseUrl: string;
}

@Injectable()
export class FactusAuthService {
  private readonly logger = new Logger(FactusAuthService.name);
  private readonly tokenCache = new Map<string, CachedToken>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FactusCryptoService,
  ) {}

  /**
   * Obtiene un access_token válido para el tenant, reutilizando la caché en memoria
   * o renovándolo preventivamente antes de su expiración.
   */
  async getValidAccessToken(tenantId: string): Promise<{ accessToken: string; baseUrl: string }> {
    const cached = this.tokenCache.get(tenantId);
    const now = Date.now();

    // Si está en caché y faltan más de 60 segundos para vencer, reutilizar
    if (cached && cached.expiresAt - now > 60000) {
      return { accessToken: cached.accessToken, baseUrl: cached.baseUrl };
    }

    const config = await this.prisma.factusTenantConfig.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!config || !config.is_active) {
      throw new NotFoundException(
        `Configuración Factus API v2 no encontrada o inactiva para el restaurante ${tenantId}. Configure las credenciales en Ajustes de Facturación.`,
      );
    }

    const baseUrl = config.api_base_url.replace(/\/+$/, '');
    const clientId = this.crypto.decrypt(config.encrypted_client_id);
    const clientSecret = this.crypto.decrypt(config.encrypted_client_secret);
    const username = this.crypto.decrypt(config.encrypted_username);
    const password = this.crypto.decrypt(config.encrypted_password);

    // Si en la base de datos hay un token guardado que aún no vence
    if (
      config.encrypted_access_token &&
      config.token_expires_at &&
      config.token_expires_at.getTime() - now > 60000
    ) {
      const dbAccessToken = this.crypto.decrypt(config.encrypted_access_token);
      this.tokenCache.set(tenantId, {
        accessToken: dbAccessToken,
        expiresAt: config.token_expires_at.getTime(),
        baseUrl,
      });
      return { accessToken: dbAccessToken, baseUrl };
    }

    // Intentar renovación con refresh_token si existe
    if (config.encrypted_refresh_token) {
      const refreshToken = this.crypto.decrypt(config.encrypted_refresh_token);
      try {
        const renewed = await this.requestOAuthToken(baseUrl, {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        });

        await this.persistTokens(tenantId, config.id, baseUrl, renewed);
        return { accessToken: renewed.access_token, baseUrl };
      } catch (refreshErr) {
        this.logger.warn(
          `Fallo al renovar token Factus con refresh_token para tenant ${tenantId}. Intentando login con contraseña... Error: ${(refreshErr as Error).message}`,
        );
      }
    }

    // Login inicial completo con grant_type: 'password'
    try {
      const tokenResponse = await this.requestOAuthToken(baseUrl, {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password,
      });

      await this.persistTokens(tenantId, config.id, baseUrl, tokenResponse);
      return { accessToken: tokenResponse.access_token, baseUrl };
    } catch (authErr) {
      this.logger.error(
        `Error de autenticación contra Factus v2 (${baseUrl}/oauth/token): ${(authErr as Error).message}`,
      );
      throw new UnauthorizedException(
        `No fue posible autenticar contra Factus API v2. Verifique las credenciales (Client ID, Secret, Correo y Contraseña).`,
      );
    }
  }

  /**
   * Invoca directamente el endpoint /oauth/token para validar credenciales en tiempo real
   */
  async testRawCredentials(
    baseUrl: string,
    clientId: string,
    clientSecret: string,
    username: string,
    password: string,
  ): Promise<{ success: boolean; message: string; token_type?: string; expires_in?: number }> {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    try {
      const resp = await this.requestOAuthToken(cleanBaseUrl, {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password,
      });

      return {
        success: true,
        message: 'Conexión exitosa con Factus API v2 y token generado correctamente.',
        token_type: resp.token_type,
        expires_in: resp.expires_in,
      };
    } catch (err) {
      return {
        success: false,
        message: `Error al conectar con Factus: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Invalida el token en caché para forzar re-autenticación inmediata
   */
  invalidateTenantToken(tenantId: string): void {
    this.tokenCache.delete(tenantId);
  }

  private async requestOAuthToken(
    baseUrl: string,
    bodyParams: Record<string, string>,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number; token_type: string }> {
    const formUrlEncoded = new URLSearchParams(bodyParams).toString();
    const tokenUrl = `${baseUrl}/oauth/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formUrlEncoded,
    });

    const data = (await res.json().catch(() => null)) as any;

    if (!res.ok || !data?.access_token) {
      const errMsg =
        data?.message || data?.error_description || data?.error || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: typeof data.expires_in === 'number' ? data.expires_in : 1209600,
      token_type: data.token_type || 'Bearer',
    };
  }

  private async persistTokens(
    tenantId: string,
    configId: string,
    baseUrl: string,
    tokenData: { access_token: string; refresh_token?: string; expires_in: number },
  ): Promise<void> {
    const expiresAtMs = Date.now() + Math.max(60, tokenData.expires_in - 120) * 1000;
    const expiresAtDate = new Date(expiresAtMs);

    this.tokenCache.set(tenantId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: expiresAtMs,
      baseUrl,
    });

    await this.prisma.factusTenantConfig.update({
      where: { id: configId },
      data: {
        encrypted_access_token: this.crypto.encrypt(tokenData.access_token),
        encrypted_refresh_token: tokenData.refresh_token
          ? this.crypto.encrypt(tokenData.refresh_token)
          : undefined,
        token_expires_at: expiresAtDate,
      },
    });
  }
}
