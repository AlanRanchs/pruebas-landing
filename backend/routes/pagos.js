
const express = require('express');
const router = express.Router();

// Cambiar de Mercado Pago a Stripe
const { crearSuscripcionDinamica } = require('../controllers/stripeControllers');
const { ordenGratuita } = require('../controllers/ordenGratuitaController');
const { obtenerVentas } = require('../controllers/adminController');
const { registrarVentaManual } = require('../controllers/adminController');  

// Rutas de pago y ventas
router.post('/suscripcion', crearSuscripcionDinamica);
router.post('/orden-gratis', ordenGratuita);
router.get('/ventas', obtenerVentas);
router.post('/venta-manual', registrarVentaManual);

module.exports = router;
