const pool = require("../db");
const emailController = require("../pdf/controllers/emailController");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); //

const webhookSuscripcion = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // Verificar la firma del webhook de Stripe
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Error verificando webhook de Stripe:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Manejar diferentes tipos de eventos de Stripe
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "customer.subscription.created":
        console.log("Suscripción creada:", event.data.object.id);
        break;

      case "customer.subscription.updated":
        console.log("Suscripción actualizada:", event.data.object.id);
        break;

      case "customer.subscription.deleted":
        console.log("Suscripción cancelada:", event.data.object.id);
        break;

      default:
        console.log(`Evento no manejado: ${event.type}`);
    }

    res.status(200).send("Webhook procesado correctamente");
  } catch (error) {
    console.error("Error procesando webhook de Stripe:", error);
    res.status(500).send("Error interno del servidor");
  }
};

const handleCheckoutSessionCompleted = async (session) => {
  console.log("Checkout session completada:", session.id);

  // Buscar la venta en la base de datos usando el session.id
  const result = await pool.query(
    "SELECT * FROM ventas WHERE preapproval_id = $1",
    [session.id]
  );
  const venta = result.rows[0];

  if (!venta) {
    console.warn(`No se encontró venta para session ${session.id}`);
    return;
  }

  if (venta.estado === "procesada") {
    console.log(`Venta ${session.id} ya estaba procesada`);
    return;
  }

  // Actualizar estado a procesada
  await pool.query("UPDATE ventas SET estado = $1 WHERE preapproval_id = $2", [
    "procesada",
    session.id,
  ]);

  // Enviar correos de confirmación
  const reqMock = {
    body: {
      nombrePaquete: venta.nombre_paquete,
      resumenServicios: venta.resumen_servicios,
      monto: venta.monto,
      tipoSuscripcion: venta.tipo_suscripcion,
      fecha: venta.fecha,
      clienteEmail: venta.cliente_email,
      mensajeContinuar: venta.mensaje_continuar,
    },
  };
  const resMock = { status: () => ({ json: () => {} }) };

  await emailController.sendOrderConfirmationToCompany(reqMock, resMock);
  await emailController.sendPaymentConfirmationToClient(reqMock, resMock);

  console.log(`Venta confirmada y correos enviados: ${session.id}`);
};

const handleInvoicePaymentSucceeded = async (invoice) => {
  console.log("Pago de factura exitoso:", invoice.id);

  // Este evento se dispara para pagos recurrentes
  // Aquí podrías manejar lógica adicional para pagos recurrentes
  const subscriptionId = invoice.subscription;
  console.log(`Pago recurrente exitoso para suscripción: ${subscriptionId}`);
};

const handleInvoicePaymentFailed = async (invoice) => {
  console.log("Pago de factura falló:", invoice.id);

  // Manejar pagos fallidos
  const subscriptionId = invoice.subscription;
  console.log(`Pago falló para suscripción: ${subscriptionId}`);

  // Aquí podrías implementar lógica para notificar al cliente
  // o actualizar el estado de la suscripción en tu base de datos
};

module.exports = { webhookSuscripcion };
