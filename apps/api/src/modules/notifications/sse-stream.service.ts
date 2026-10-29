import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, interval, merge, map, finalize, share } from 'rxjs';

export interface SseMessageEvent {
  data: string | object;
  type?: string;
  id?: string;
  retry?: number;
}

export type BranchOrderEventType =
  | 'order.created'
  | 'order.adjusted'
  | 'order.status_changed'
  | 'order.payment_recorded'
  | 'order.payment_voided'
  | 'order.uncollected_resolved'
  | 'order.resolution_reverted'
  | 'kitchen.order_updated'
  | 'dining.table_updated'
  | 'dining.account_opened'
  | 'dining.order_added'
  | 'dining.table_transferred'
  | 'dining.account_closed'
  | 'dining.account_reopened'
  | 'dining.qr_order_requested';

@Injectable()
export class SseStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(SseStreamService.name);

  // Canales reactivos en memoria indexados por clave única
  private readonly channels = new Map<string, Subject<SseMessageEvent>>();
  // Conteo de suscriptores activos por canal para limpieza de memoria
  private readonly subscriberCounts = new Map<string, number>();

  /**
   * Obtiene o crea un Subject para una clave de canal específica.
   */
  private getOrCreateSubject(channelKey: string): Subject<SseMessageEvent> {
    let subject = this.channels.get(channelKey);
    if (!subject) {
      subject = new Subject<SseMessageEvent>();
      this.channels.set(channelKey, subject);
      this.subscriberCounts.set(channelKey, 0);
    }
    return subject;
  }

  /**
   * Suscripción privada para el panel operativo de sucursal.
   * Clave: `branch:{tenantId}:{branchId}:orders`
   * Emite eventos de ordenes y heartbeat periódico cada 25 segundos.
   */
  subscribeToBranch(tenantId: string, branchId: string): Observable<SseMessageEvent> {
    const channelKey = `branch:${tenantId}:${branchId}:orders`;
    return this.createManagedStream(channelKey);
  }

  /**
   * Suscripción pública para comensales en seguimiento en vivo.
   * Clave: `tracking:{publicOrderToken}`
   */
  subscribeToTracking(publicOrderToken: string): Observable<SseMessageEvent> {
    const channelKey = `tracking:${publicOrderToken}`;
    return this.createManagedStream(channelKey);
  }

  /**
   * Crea un flujo reactivo con heartbeat periódico de 25 segundos y limpieza automática al desconectar.
   */
  private createManagedStream(channelKey: string): Observable<SseMessageEvent> {
    const subject = this.getOrCreateSubject(channelKey);
    const currentCount = this.subscriberCounts.get(channelKey) || 0;
    this.subscriberCounts.set(channelKey, currentCount + 1);

    this.logger.debug(
      `Nueva conexión SSE a '${channelKey}' (Total suscriptores en canal: ${currentCount + 1})`,
    );

    // Heartbeat de 25 segundos para mantener vivas las conexiones en proxies y redes móviles
    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        type: 'ping',
        data: { timestamp: new Date().toISOString() },
      })),
    );

    // Conexión inicial inmediata
    const initialConnected$: Observable<SseMessageEvent> = new Observable((subscriber) => {
      subscriber.next({
        type: 'connected',
        data: { channel: channelKey, connected_at: new Date().toISOString() },
      });
      subscriber.complete();
    });

    return merge(initialConnected$, subject.asObservable(), heartbeat$).pipe(
      finalize(() => {
        const remaining = (this.subscriberCounts.get(channelKey) || 1) - 1;
        if (remaining <= 0) {
          this.subscriberCounts.delete(channelKey);
          this.channels.delete(channelKey);
          this.logger.debug(`Canal SSE '${channelKey}' destruido por inactividad total.`);
        } else {
          this.subscriberCounts.set(channelKey, remaining);
          this.logger.debug(
            `Desconexión en canal SSE '${channelKey}' (Suscriptores restantes: ${remaining})`,
          );
        }
      }),
      share(),
    );
  }

  /**
   * Emite un evento hacia el panel operativo de la sucursal.
   */
  emitToBranch(
    tenantId: string,
    branchId: string,
    eventType: BranchOrderEventType,
    payload: any,
  ): void {
    const channelKey = `branch:${tenantId}:${branchId}:orders`;
    const subject = this.channels.get(channelKey);
    if (subject) {
      this.logger.log(`Emitiendo '${eventType}' a canal '${channelKey}'`);
      subject.next({
        type: eventType,
        data: payload,
      });
    }
  }

  /**
   * Emite un evento hacia el stream público de seguimiento del comensal.
   */
  emitToTracking(publicOrderToken: string, payload: any): void {
    const channelKey = `tracking:${publicOrderToken}`;
    const subject = this.channels.get(channelKey);
    if (subject) {
      this.logger.log(`Emitiendo 'tracking.updated' a canal público '${channelKey}'`);
      subject.next({
        type: 'tracking.updated',
        data: payload,
      });
    }
  }

  /**
   * Limpieza de todos los canales en apagado del servidor.
   */
  onModuleDestroy(): void {
    for (const [key, subject] of this.channels.entries()) {
      subject.complete();
    }
    this.channels.clear();
    this.subscriberCounts.clear();
  }
}
