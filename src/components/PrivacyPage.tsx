import React from 'react';

const PrivacyPage: React.FC = () => {
  const updated = '9 de mayo de 2026';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <i className="fas fa-arrow-left text-sm" />
          </a>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-black text-sm">⚡ ALPHA STAGE</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400 text-sm">Política de privacidad</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Política de Privacidad</h1>
        <p className="text-slate-500 text-sm mb-10">Última actualización: {updated} — Conforme al RGPD (UE) 2016/679 y la LOPDGDD</p>

        <div className="space-y-10 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-black text-lg mb-3">1. Responsable del tratamiento</h2>
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 space-y-1 text-slate-400">
              <p><strong className="text-white">Empresa:</strong> Gosua Films S.L.</p>
              <p><strong className="text-white">Domicilio:</strong> Calle Luisa Fernanda 27, 1º Drcha., 28008 Madrid, España</p>
              <p><strong className="text-white">Correo:</strong> <a href="mailto:juantxu@gosua.com" className="text-amber-400 hover:underline">juantxu@gosua.com</a></p>
              <p><strong className="text-white">Actividad:</strong> Plataforma SaaS de análisis bursátil educativo (alphastage.finance)</p>
            </div>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">2. Datos que recogemos</h2>
            <div className="space-y-3">
              {[
                {
                  title: 'Datos de registro',
                  items: ['Dirección de correo electrónico', 'Contraseña (almacenada en hash cifrado — nunca en texto plano)'],
                  base: 'Ejecución del contrato (art. 6.1.b RGPD)',
                },
                {
                  title: 'Datos de uso',
                  items: ['Tickers analizados', 'Historial de análisis', 'Alertas configuradas', 'Posiciones de cartera introducidas'],
                  base: 'Ejecución del contrato (art. 6.1.b RGPD)',
                },
                {
                  title: 'Datos de pago',
                  items: ['Los datos de pago son procesados directamente por Stripe. Gosua Films S.L. únicamente recibe el identificador de cliente Stripe y el estado de la suscripción.'],
                  base: 'Ejecución del contrato (art. 6.1.b RGPD)',
                },
                {
                  title: 'Datos de notificaciones (opcional)',
                  items: ['ID de chat de Telegram (solo si el usuario activa la integración voluntariamente)'],
                  base: 'Consentimiento del usuario (art. 6.1.a RGPD)',
                },
                {
                  title: 'Datos técnicos',
                  items: ['Dirección IP y agente de navegador en los logs del servidor (propósito de seguridad)'],
                  base: 'Interés legítimo (art. 6.1.f RGPD)',
                },
              ].map(({ title, items, base }) => (
                <div key={title} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                  <p className="font-black text-white mb-1">{title}</p>
                  <ul className="list-none space-y-0.5 text-slate-400 mb-2">
                    {items.map(i => <li key={i} className="flex gap-2"><span className="text-amber-500 shrink-0">·</span>{i}</li>)}
                  </ul>
                  <p className="text-xs text-slate-600"><strong className="text-slate-500">Base legal:</strong> {base}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">3. Finalidades del tratamiento</h2>
            <ul className="space-y-2 list-none text-slate-400">
              {[
                'Prestación del servicio de análisis bursátil y funcionalidades asociadas.',
                'Gestión de la cuenta de usuario y autenticación.',
                'Procesamiento de pagos y gestión de suscripciones a través de Stripe.',
                'Envío de alertas de precio y resúmenes de mercado (solo si el usuario los activa).',
                'Mejora y desarrollo del servicio mediante análisis de uso agregado y anonimizado.',
                'Cumplimiento de obligaciones legales.',
              ].map(f => (
                <li key={f} className="flex gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{f}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">4. Destinatarios y transferencias</h2>
            <p className="mb-3 text-slate-400">Sus datos podrán ser comunicados a los siguientes terceros, todos ellos con las garantías adecuadas según el RGPD:</p>
            <div className="space-y-2">
              {[
                { name: 'Supabase Inc.', role: 'Base de datos y autenticación', country: 'EE.UU. (cláusulas contractuales tipo UE)' },
                { name: 'Stripe Inc.', role: 'Procesamiento de pagos', country: 'EE.UU. (Privacy Shield / SCC)' },
                { name: 'Resend Inc.', role: 'Envío de correos electrónicos transaccionales', country: 'EE.UU. (SCC)' },
                { name: 'Anthropic PBC', role: 'Generación de análisis por IA (se envía solo el ticker)', country: 'EE.UU. (SCC)' },
                { name: 'Telegram Messenger', role: 'Notificaciones (solo si el usuario activa la integración)', country: 'Opcional — bajo consentimiento' },
              ].map(({ name, role, country }) => (
                <div key={name} className="flex items-start gap-3 bg-slate-900 rounded-lg p-3 border border-slate-800">
                  <span className="text-amber-400 font-black text-xs mt-0.5 shrink-0 w-28">{name}</span>
                  <div className="text-slate-400 text-xs">
                    <p>{role}</p>
                    <p className="text-slate-600 mt-0.5">{country}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-slate-500 text-xs">No vendemos ni cedemos sus datos a terceros con fines comerciales.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">5. Conservación de datos</h2>
            <ul className="space-y-2 list-none text-slate-400">
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">·</span><span><strong className="text-white">Cuenta activa:</strong> mientras el usuario mantenga su cuenta, más 30 días tras la solicitud de baja.</span></li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">·</span><span><strong className="text-white">Datos de facturación:</strong> 5 años desde la última transacción (obligación fiscal española).</span></li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">·</span><span><strong className="text-white">Logs técnicos:</strong> máximo 90 días.</span></li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">6. Sus derechos (RGPD)</h2>
            <p className="mb-3 text-slate-400">Puede ejercer los siguientes derechos escribiendo a <a href="mailto:juantxu@gosua.com" className="text-amber-400 hover:underline">juantxu@gosua.com</a> con asunto «RGPD — [Derecho]»:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { right: 'Acceso', desc: 'Conocer qué datos tenemos sobre usted.' },
                { right: 'Rectificación', desc: 'Corregir datos inexactos o incompletos.' },
                { right: 'Supresión', desc: 'Solicitar el borrado de sus datos («derecho al olvido»).' },
                { right: 'Portabilidad', desc: 'Recibir sus datos en formato estructurado y legible.' },
                { right: 'Oposición', desc: 'Oponerse al tratamiento basado en interés legítimo.' },
                { right: 'Limitación', desc: 'Restringir el tratamiento en determinadas circunstancias.' },
              ].map(({ right, desc }) => (
                <div key={right} className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                  <p className="font-black text-white text-xs mb-0.5">{right}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-slate-500 text-xs">Atenderemos su solicitud en un plazo máximo de 30 días. Si no obtiene respuesta satisfactoria, puede reclamar ante la <strong className="text-slate-400">Agencia Española de Protección de Datos (AEPD)</strong> en <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">www.aepd.es</a>.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">7. Cookies</h2>
            <p className="text-slate-400">La Plataforma utiliza exclusivamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio (sesión de autenticación y preferencias de interfaz). No se utilizan cookies de seguimiento, publicidad ni analytics de terceros.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">8. Seguridad</h2>
            <p className="text-slate-400">Aplicamos medidas técnicas y organizativas adecuadas para proteger sus datos: conexiones cifradas (TLS/HTTPS), contraseñas hasheadas con bcrypt, acceso restringido mediante Row Level Security en base de datos, y auditorías periódicas de seguridad.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">9. Modificaciones</h2>
            <p className="text-slate-400">Podemos actualizar esta Política para reflejar cambios legales o en el servicio. Le notificaremos por correo electrónico con al menos 15 días de antelación ante cambios materiales.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">10. Contacto</h2>
            <p className="text-slate-400">Para cualquier consulta sobre privacidad: <a href="mailto:juantxu@gosua.com" className="text-amber-400 hover:underline">juantxu@gosua.com</a></p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
          <span>© 2026 Gosua Films S.L. — Alpha Stage Terminal</span>
          <a href="/legal/terms" className="text-amber-400 hover:underline">Términos de uso →</a>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
