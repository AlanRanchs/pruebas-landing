const express = require('express');
const router = express.Router();
// importa la función que maneja las notificaciones webhook de Stripe
const { webhookSuscripcion } = require('../controllers/stripeWebhookController');

/**
 * ruta POST para recibir notificaciones webhook desde Stripe.
 * Procesa eventos de pago o autorización y envía correos.
 */
router.post('/', webhookSuscripcion);

module.exports = router;