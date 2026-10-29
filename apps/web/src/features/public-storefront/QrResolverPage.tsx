import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../services/api-client';
import { QrCode, AlertCircle, RotateCcw, Home } from 'lucide-react';

export const QrResolverPage: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!qrToken) return;

    let isMounted = true;
    apiClient
      .get(`/public/qr/${qrToken}`)
      .then((data: any) => {
        if (!isMounted) return;
        if (data.restaurant_slug && data.branch_slug) {
          navigate(`/r/${data.restaurant_slug}/b/${data.branch_slug}?qr=${qrToken}`, { replace: true });
        } else if (data.restaurant_slug) {
          navigate(`/r/${data.restaurant_slug}?qr=${qrToken}`, { replace: true });
        } else {
          setIsLoading(false);
          setErrorStatus(404);
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setIsLoading(false);
        setErrorStatus(err.status || 404);
        setErrorMessage(err.data?.message || err.message || 'Código QR no válido');
      });

    return () => {
      isMounted = false;
    };
  }, [qrToken, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-orange-600 animate-pulse mx-auto" />
          <p className="text-xs font-bold text-stone-600">Resolviendo código QR...</p>
        </div>
      </div>
    );
  }

  // QR Revocado (410 GONE)
  if (errorStatus === 410) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 text-center space-y-5 shadow-lg">
          <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertCircle className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-lg font-black text-stone-900">Código QR Revocado</h1>
            <p className="text-xs text-stone-500 leading-relaxed">
              Este código QR ha sido deshabilitado o actualizado por el restaurante y ya no está en servicio.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-600">
            Solicita al mesero o al personal del restaurante el nuevo código QR impreso en tu mesa o en la carta.
          </div>

          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md transition w-full"
          >
            <Home className="h-4 w-4" />
            <span>Ir al Inicio</span>
          </Link>
        </div>
      </div>
    );
  }

  // No encontrado o error
  return (
    <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 text-center space-y-5 shadow-lg">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <QrCode className="h-7 w-7" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-black text-stone-900">Código QR No Encontrado</h1>
          <p className="text-xs text-stone-500 leading-relaxed">
            {errorMessage || 'El enlace escaneado no corresponde a ningún código QR activo en Karta.'}
          </p>
        </div>

        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-md transition w-full"
        >
          <Home className="h-4 w-4" />
          <span>Volver al Inicio</span>
        </Link>
      </div>
    </div>
  );
};
