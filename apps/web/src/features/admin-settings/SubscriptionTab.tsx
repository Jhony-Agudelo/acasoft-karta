import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  TenantSubscriptionResponseDto,
  formatMoneyCop,
} from '@restaurante-saas/shared';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  FileText,
  Calendar,
  ExternalLink,
  Crown,
} from 'lucide-react';

export const SubscriptionTab: React.FC = () => {
  const { data: subscription, isLoading, isError, refetch } = useQuery<TenantSubscriptionResponseDto>({
    queryKey: ['admin-subscription'],
    queryFn: () => apiClient.get('/admin/subscription'),
  });

  const getPlanInfo = (planId: string) => {
    switch (planId) {
      case 'PLAN_STARTER_WHATSAPP':
        return {
          name: 'Starter WhatsApp',
          price: '$39.000 COP / mes',
          description: 'Catálogo digital, pedidos por WhatsApp y panel liviano de órdenes.',
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        };
      case 'PLAN_OPERATIONS_PRO':
        return {
          name: 'Operations Pro',
          price: '$89.000 COP / mes',
          description: 'Panel operativo completo, cobros manuales, cocina KDS y reportes conciliados.',
          badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
        };
      case 'PLAN_ENTERPRISE_DINING':
        return {
          name: 'Enterprise Dining',
          price: '$149.000 COP / mes',
          description: 'Mesas, comandas de salón, división de cuentas y reportes multi-sucursal.',
          badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
        };
      default:
        return {
          name: planId,
          price: 'Tarifa personalizada',
          description: 'Plan modular a medida.',
          badgeColor: 'bg-stone-100 text-stone-800 border-stone-200',
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            ACTIVA
          </span>
        );
      case 'TRIALING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-extrabold border border-blue-200">
            <Clock className="h-3.5 w-3.5" />
            PERIODO DE PRUEBA
          </span>
        );
      case 'PAST_DUE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            PAGO PENDIENTE
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-extrabold border border-red-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            SUSPENDIDA POR FALTA DE PAGO
          </span>
        );
      default:
        return <span className="text-xs font-bold text-stone-600">{status}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200 shadow-sm">
        <div className="inline-block animate-spin h-6 w-6 border-3 border-orange-500 border-t-transparent rounded-full mb-2" />
        <p className="text-xs font-bold text-stone-700">Cargando información de suscripción...</p>
      </div>
    );
  }

  if (isError || !subscription) {
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 rounded-2xl border border-red-200">
        <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-500" />
        <p className="font-bold text-sm">No se pudo consultar el estado de la suscripción SaaS.</p>
      </div>
    );
  }

  const plan = getPlanInfo(subscription.plan_id);

  return (
    <div className="space-y-6">
      {/* Tarjeta de Plan Actual */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-2xl text-white shadow-md shadow-orange-500/20">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-stone-900">{plan.name}</h3>
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${plan.badgeColor}`}>
                  {subscription.plan_id}
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium mt-0.5">{plan.description}</p>
            </div>
          </div>
          <div>{getStatusBadge(subscription.status)}</div>
        </div>

        {/* Detalles de Periodo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
            <span className="text-[10px] font-bold text-stone-400 uppercase">Tarifa Mensual</span>
            <p className="text-base font-extrabold text-stone-900 mt-0.5">{plan.price}</p>
            <span className="text-[10px] text-stone-500">Facturación manual vía soporte</span>
          </div>

          <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
            <span className="text-[10px] font-bold text-stone-400 uppercase">Inicio de Periodo</span>
            <p className="text-sm font-bold text-stone-800 mt-0.5">
              {new Date(subscription.current_period_start).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <span className="text-[10px] text-stone-500">Última renovación</span>
          </div>

          <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
            <span className="text-[10px] font-bold text-stone-400 uppercase">Corte / Vencimiento</span>
            <p className="text-sm font-bold text-stone-800 mt-0.5">
              {new Date(subscription.current_period_end).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <span className="text-[10px] text-stone-500">Fecha límite de pago</span>
          </div>
        </div>

        {/* Módulos Incluidos en el Plan */}
        <div className="pt-2 border-t border-stone-100">
          <span className="text-[11px] font-bold text-stone-600 uppercase block mb-2">
            Módulos y Capacidades Habilitadas por tu Plan
          </span>
          <div className="flex flex-wrap gap-2">
            {subscription.entitled_modules.map((modKey) => (
              <span
                key={modKey}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-50 border border-orange-200/80 text-orange-950 text-xs font-semibold shadow-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-orange-600" />
                {modKey}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Historial de Facturas SaaS */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-stone-700" />
            <h3 className="text-sm font-bold text-stone-900">Historial de Facturación SaaS</h3>
          </div>
          <span className="text-xs text-stone-500">
            {subscription.invoices.length} facturas registradas
          </span>
        </div>

        {subscription.invoices.length === 0 ? (
          <div className="py-8 text-center text-stone-400 text-xs">
            No hay facturas manuales emitidas todavía en esta cuenta.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 text-stone-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Código Factura</th>
                  <th className="py-2.5 px-3">Fecha de Emisión</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Monto COP</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Referencia / Comprobante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {subscription.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-stone-50/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{inv.invoice_code}</td>
                    <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">
                      {new Date(inv.issued_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-stone-700">{inv.plan_id}</td>
                    <td className="py-2.5 px-3 font-extrabold text-stone-900">
                      {formatMoneyCop(inv.amount_cop)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-stone-500 italic max-w-xs truncate">
                      {inv.payment_reference_note || 'Sin nota de pago'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Banner de Contacto y Asistencia de Pagos */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold text-orange-950 uppercase tracking-wider">
            ¿Deseas cambiar de plan o reportar un comprobante de pago?
          </h4>
          <p className="text-xs text-orange-800 mt-1">
            Los pagos se concilian manualmente mediante transferencia a Bancolombia o Nequi. El equipo de AcaSoft Karta habilitará tus módulos inmediatamente.
          </p>
        </div>
        <a
          href="https://wa.me/573001234567?text=Hola%2C+deseo+renovar+o+cambiar+el+plan+de+mi+restaurante+en+Karta"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all shrink-0 active:scale-95"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Contactar a Soporte SaaS
        </a>
      </div>
    </div>
  );
};
