import React from 'react';

const TermsPage: React.FC = () => {
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
            <span className="text-slate-400 text-sm">Términos de uso</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Términos de Uso</h1>
        <p className="text-slate-500 text-sm mb-10">Última actualización: {updated}</p>

        <div className="space-y-10 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-black text-lg mb-3">1. Identificación del titular</h2>
            <p>El presente sitio web <strong className="text-white">alphastage.finance</strong> (en adelante, «la Plataforma») es operado por <strong className="text-white">Gosua Films S.L.</strong>, con NIF <strong className="text-white">B87531778</strong>, domicilio en Calle Luisa Fernanda 27, 1º Drcha., 28008 Madrid, España, e inscrita en el Registro Mercantil de Madrid. Correo electrónico de contacto: <a href="mailto:contabilidad@gosua.com" className="text-amber-400 hover:underline">contabilidad@gosua.com</a>.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">2. Objeto del servicio</h2>
            <p>Alpha Stage Terminal es una herramienta educativa de análisis técnico bursátil basada en el método Weinstein. La Plataforma proporciona análisis generados por inteligencia artificial, screener de valores, alertas de precio, gestión de cartera simulada y notificaciones de mercado.</p>
            <div className="mt-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-400 font-bold">⚠️ Aviso importante</p>
              <p className="mt-1 text-slate-400">La información proporcionada por la Plataforma tiene carácter exclusivamente educativo e informativo. <strong className="text-white">No constituye asesoramiento financiero, de inversión ni recomendación de compra o venta de ningún activo.</strong> El usuario asume íntegramente las decisiones de inversión y los riesgos derivados de las mismas.</p>
            </div>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">3. Registro y cuenta de usuario</h2>
            <p>Para acceder a las funcionalidades de la Plataforma es necesario crear una cuenta proporcionando un correo electrónico y contraseña. El usuario se compromete a facilitar datos verídicos y a mantener la confidencialidad de sus credenciales. Gosua Films S.L. no será responsable de los daños derivados del uso no autorizado de la cuenta del usuario.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">4. Planes y suscripciones</h2>
            <p className="mb-3">La Plataforma ofrece dos modalidades de acceso:</p>
            <ul className="space-y-2 list-none">
              <li className="flex gap-2"><span className="text-amber-400 mt-0.5">→</span><span><strong className="text-white">Plan Gratuito:</strong> acceso limitado a 10 análisis mensuales y 2 alertas activas.</span></li>
              <li className="flex gap-2"><span className="text-amber-400 mt-0.5">→</span><span><strong className="text-white">Plan Pro:</strong> acceso completo con análisis ilimitados, screener, hasta 20 alertas, cartera IA y notificaciones Telegram, mediante suscripción mensual o anual.</span></li>
            </ul>
            <p className="mt-3">Los pagos se procesan a través de <strong className="text-white">Stripe</strong>. El usuario puede cancelar su suscripción en cualquier momento desde el portal de gestión de Stripe; el acceso Pro permanecerá activo hasta el final del periodo facturado. No se realizan reembolsos por periodos parciales salvo obligación legal.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">5. Uso permitido y prohibido</h2>
            <p className="mb-3">El usuario se compromete a utilizar la Plataforma conforme a la ley y a estos Términos. Queda expresamente prohibido:</p>
            <ul className="space-y-1.5 list-none text-slate-400">
              {[
                'Reproducir, redistribuir o revender los análisis generados sin autorización expresa.',
                'Utilizar la Plataforma para fines ilegales o contrarios al orden público.',
                'Intentar acceder a cuentas ajenas o vulnerar la seguridad de los sistemas.',
                'Realizar scraping automatizado o uso abusivo de la API.',
                'Presentar los análisis de la Plataforma como asesoramiento financiero profesional.',
              ].map(item => (
                <li key={item} className="flex gap-2"><span className="text-rose-400 mt-0.5 shrink-0">✕</span><span>{item}</span></li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">6. Propiedad intelectual</h2>
            <p>Todos los contenidos, diseños, código fuente, marcas y elementos gráficos de la Plataforma son propiedad de Gosua Films S.L. o de sus licenciantes. El usuario no adquiere ningún derecho de propiedad intelectual sobre los mismos. Los análisis generados por IA son para uso personal del usuario y no pueden redistribuirse con fines comerciales.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">7. Limitación de responsabilidad</h2>
            <p>Gosua Films S.L. no garantiza la exactitud, integridad o actualidad de los datos de mercado ni de los análisis generados. En ningún caso será responsable de pérdidas económicas derivadas de decisiones de inversión basadas en los contenidos de la Plataforma. La responsabilidad máxima de Gosua Films S.L. se limitará al importe abonado por el usuario en los últimos 12 meses.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">8. Modificación y terminación</h2>
            <p>Gosua Films S.L. se reserva el derecho de modificar estos Términos en cualquier momento, notificando al usuario con al menos 15 días de antelación mediante correo electrónico. El uso continuado de la Plataforma tras la notificación implica la aceptación de los nuevos Términos. Gosua Films S.L. podrá suspender o cancelar cuentas que incumplan estos Términos.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">9. Ley aplicable y jurisdicción</h2>
            <p>Estos Términos se rigen por la legislación española. Para la resolución de cualquier controversia, las partes se someten a los juzgados y tribunales de la ciudad de Madrid, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.</p>
          </section>

          <section>
            <h2 className="text-white font-black text-lg mb-3">10. Contacto</h2>
            <p>Para cualquier consulta sobre estos Términos, puede contactar con nosotros en <a href="mailto:contabilidad@gosua.com" className="text-amber-400 hover:underline">contabilidad@gosua.com</a>.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
          <span>© 2026 Gosua Films S.L. — Alpha Stage Terminal</span>
          <a href="/legal/privacy" className="text-amber-400 hover:underline">Política de privacidad →</a>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
