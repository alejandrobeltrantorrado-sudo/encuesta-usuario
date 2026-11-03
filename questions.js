/* Definición única de la encuesta. La usan el formulario, el servidor y el dashboard. */
(function (root) {
  const FACTORES = [
    { id: 'tasa', label: 'Tasa o precio menos competitivo', short: 'Tasa o precio' },
    { id: 'comisiones', label: 'Comisiones', short: 'Comisiones' },
    { id: 'negociacion', label: 'Formas de negociación (OTC, límites, montos mínimos o máximos)', short: 'Formas de negociación' },
    { id: 'automatizacion', label: 'Falta de automatización (API, operaciones programadas)', short: 'Automatización (API)' },
    { id: 'terceros', label: 'No poder enviar fondos a cuentas de terceros', short: 'Envío a terceros' },
    { id: 'tiempos', label: 'Tiempos de depósito o retiro', short: 'Tiempos depósito/retiro' },
    { id: 'soporte', label: 'Atención y soporte', short: 'Atención y soporte' },
    { id: 'verificacion', label: 'Procesos de verificación o documentación', short: 'Verificación/documentos' },
    { id: 'necesidad', label: 'Cambié de necesidad o ya no opero cripto', short: 'Cambió de necesidad' },
    { id: 'otro', label: 'Otro', short: 'Otro' }
  ];

  const Q = {
    FACTORES,
    p1: { title: '¿Cuánto tiempo operaste con Buda?', options: [
      { id: 'lt6', label: 'Menos de 6 meses' },
      { id: '6a12', label: '6 a 12 meses' },
      { id: '1a2', label: '1 a 2 años' },
      { id: 'gt2', label: 'Más de 2 años' }
    ] },
    p2: { title: '¿Para qué usabas principalmente Buda?', options: [
      { id: 'inversion', label: 'Inversión o ahorro en cripto' },
      { id: 'stablecoins', label: 'Compra/venta de stablecoins' },
      { id: 'pagos_terceros', label: 'Pagos a proveedores o terceros' },
      { id: 'remesas', label: 'Remesas o pagos internacionales' },
      { id: 'tesoreria', label: 'Tesorería de empresa' },
      { id: 'otro', label: 'Otro' }
    ] },
    p3: { title: '¿Con qué frecuencia operabas?', options: [
      { id: 'diaria', label: 'Diaria' },
      { id: 'semanal', label: 'Semanal' },
      { id: 'mensual', label: 'Mensual' },
      { id: 'ocasional', label: 'Ocasional' }
    ] },
    p4: { title: 'En tus palabras, ¿cuál fue la principal razón por la que dejaste de operar con Buda?' },
    p5: { title: '¿Cuáles de estos factores influyeron en tu decisión?', options: FACTORES },
    p6: { title: 'De los que marcaste, ¿cuál fue el más determinante?', options: FACTORES },
    p7: { title: 'Califica qué tan importante fue cada factor en tu decisión',
      scale: '1 = nada importante · 5 = decisivo',
      rows: ['tasa', 'comisiones', 'negociacion', 'automatizacion', 'terceros', 'tiempos', 'soporte'] },
    p8: { title: '¿Necesitabas enviar fondos a cuentas de terceros (proveedores, empleados, clientes)?', options: [
      { id: 'frecuente', label: 'Sí, con frecuencia' },
      { id: 'ocasional', label: 'Sí, ocasionalmente' },
      { id: 'no', label: 'No' }
    ] },
    p9: { title: '¿Aproximadamente cuántos pagos a terceros hacías al mes?', options: [
      { id: '1a5', label: '1 a 5' },
      { id: '6a20', label: '6 a 20' },
      { id: '21a100', label: '21 a 100' },
      { id: 'gt100', label: 'Más de 100' }
    ] },
    p10: { title: '¿Cómo resolvías esa necesidad mientras operabas con Buda?' },
    p11: { title: '¿Con qué plataforma o canal operas hoy?' },
    p12: { title: '¿Qué tan probable es que vuelvas a operar con Buda si…',
      scale: '1 = nada probable · 5 = muy probable',
      rows: [
        { id: 'tasa', label: 'Mejoráramos la tasa' },
        { id: 'negociacion', label: 'Ofreciéramos nuevas formas de negociación' },
        { id: 'automatizacion', label: 'Ofreciéramos automatización / API' },
        { id: 'terceros', label: 'Permitiéramos enviar fondos a cuentas de terceros' }
      ] },
    p13: { title: '¿Hay algo más que necesitarías para volver?' },

    /* Palabras clave para SUGERIR la codificación de respuestas abiertas.
       Solo son sugerencias: la métrica usa únicamente lo que una persona confirma. */
    KEYWORDS: {
      tasa: ['tasa', 'precio', 'spread', 'cotiza', 'caro', 'cara ', 'competitiv', 'mejor valor'],
      comisiones: ['comisi', 'fee', 'cobro', 'cobran', 'costos'],
      negociacion: ['otc', 'límite', 'limite', 'monto', 'mínimo', 'minimo', 'máximo', 'maximo', 'cupo', 'negocia'],
      automatizacion: ['api', 'automati', 'programad', 'bot', 'integra'],
      terceros: ['tercero', 'proveedor', 'dispers', 'pagar a', 'pagos a', 'otra cuenta', 'cuenta de otr', 'nómina', 'nomina', 'empleado', 'enviar a otr', 'transferir a'],
      tiempos: ['demora', 'tiempo', 'lento', 'tarda', 'retiro', 'depósito', 'deposito'],
      soporte: ['soporte', 'atención', 'atencion', 'servicio al cliente', 'no respond', 'respuesta'],
      verificacion: ['verific', 'documento', 'kyc', 'papeles', 'validaci', 'requisito'],
      necesidad: ['ya no', 'dejé de', 'deje de', 'no necesito', 'no lo necesito']
    }
  };

  Q.factorById = Object.fromEntries(FACTORES.map(f => [f.id, f]));

  if (typeof module !== 'undefined' && module.exports) module.exports = Q;
  else root.SURVEY = Q;
})(this);
