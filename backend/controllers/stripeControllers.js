// Importaciones necesarias
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const preciosFile = path.join(__dirname, '../precios.json');

const crearSuscripcionDinamica = async (req, res) => {
  try {
    const { clienteEmail, orderData, tipoSuscripcion, planId } = req.body;

    if (!clienteEmail || !orderData || !orderData.monto || !planId) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }

    // Leer precios oficiales
    const preciosRaw = fs.readFileSync(preciosFile, 'utf-8');
    const precios = JSON.parse(preciosRaw);
    const tipo = ['mensual', 'anual'].includes(tipoSuscripcion) ? tipoSuscripcion : 'mensual';

    const precioOficial = precios[tipo]?.[planId.toLowerCase()];
    if (precioOficial === undefined) {
      return res.status(400).json({ message: `No existe el plan "${planId}"` });
    }

    // Calcular extras
    const isTitan = planId.toLowerCase() === 'titan';
    const isAnual = tipo === 'anual';
    const extrasGratis = ['logotipo', 'tpv', 'negocios'];
    const preciosExtras = precios[tipo]?.extras || {};
    let extrasTotales = 0;

    for (const extra of orderData.extrasSeleccionados || []) {
      const precioExtra = preciosExtras[extra];
      if (precioExtra === undefined) {
        return res.status(400).json({ message: `Extra "${extra}" no existe.` });
      }
      const esGratis = isTitan && isAnual && extrasGratis.includes(extra);
      if (!esGratis) extrasTotales += precioExtra;
    }

    const montoCalculado = precioOficial + extrasTotales;
    if (Number(orderData.monto) !== montoCalculado) {
      return res.status(400).json({
        message: `Monto incorrecto. Esperado: ${montoCalculado}, recibido: ${orderData.monto}`,
      });
    }

    // Crear o buscar cliente en Stripe
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: clienteEmail,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: clienteEmail,
        name: `Cliente ${orderData.nombrePaquete}`,
      });
    }

    // Crear producto si no existe
    const productName = `Suscripción ${orderData.nombrePaquete}`;
    let product;
    
    const existingProducts = await stripe.products.list({
      limit: 100
    });
    
    product = existingProducts.data.find(p => p.name === productName);
    
    if (!product) {
      product = await stripe.products.create({
        name: productName,
        description: `Plan ${orderData.nombrePaquete} - ${orderData.resumenServicios}`,
      });
    }

    // Crear precio para la suscripción
    const priceData = {
      unit_amount: Math.round(montoCalculado * 100), // Stripe usa centavos
      currency: 'mxn',
      recurring: {
        interval: tipo === 'anual' ? 'year' : 'month',
        interval_count: 1,
      },
      product: product.id,
    };

    const price = await stripe.prices.create(priceData);

    // Crear sesión de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: 'https://tlatec.teteocan.com?success=true',
      cancel_url: 'https://tlatec.teteocan.com?canceled=true',
      metadata: {
        planId: planId,
        tipoSuscripcion: tipo,
        clienteEmail: clienteEmail,
        nombrePaquete: orderData.nombrePaquete,
        resumenServicios: orderData.resumenServicios,
        monto: montoCalculado.toString(),
        mensajeContinuar: orderData.mensajeContinuar || 'La empresa se pondrá en contacto contigo.',
      },
    });

    // Guardar en base de datos con session_id de Stripe
    await pool.query(`
      INSERT INTO ventas (
        preapproval_id,
        cliente_email,
        nombre_paquete,
        resumen_servicios,
        monto,
        fecha,
        mensaje_continuar,
        tipo_suscripcion,
        estado
      ) VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,'pendiente')
      ON CONFLICT (preapproval_id) DO NOTHING;
    `, [
      session.id, // Usamos session.id como identificador único
      clienteEmail,
      orderData.nombrePaquete,
      orderData.resumenServicios,
      montoCalculado,
      orderData.mensajeContinuar || 'La empresa se pondrá en contacto contigo.',
      tipo
    ]);

    res.json({ init_point: session.url });

  } catch (error) {
    console.error('Error en crearSuscripcionDinamica (Stripe):', error);
    res.status(500).json({
      message: 'Error al crear suscripción',
      error: error.message || 'Error desconocido'
    });
  }
};

module.exports = { crearSuscripcionDinamica };