import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Core — app will not start without these
  DATABASE_URL: Joi.string()
    .pattern(/^postgres(ql)?:\/\//)
    .required()
    .messages({
      'string.pattern.base': 'DATABASE_URL must be a valid PostgreSQL connection string (postgresql://...)',
      'any.required':        'DATABASE_URL is required',
    }),

  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'string.min':   'JWT_SECRET must be at least 32 characters long',
      'any.required': 'JWT_SECRET is required',
    }),

  // Optional with sensible defaults
  PORT:         Joi.number().integer().min(1).max(65535).default(9000),
  NODE_ENV:     Joi.string().valid('development', 'test', 'production').default('development'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),

  // Stripe billing — optional (FREE plan works without these)
  STRIPE_SECRET_KEY:          Joi.string().pattern(/^sk_/).optional(),
  STRIPE_WEBHOOK_SECRET:      Joi.string().pattern(/^whsec_/).optional(),
  STRIPE_PRO_PRICE_ID:        Joi.string().pattern(/^price_/).optional(),
  STRIPE_ENTERPRISE_PRICE_ID: Joi.string().pattern(/^price_/).optional(),

  // AI / vector features — optional, no default
  OPENAI_API_KEY:    Joi.string().pattern(/^sk-/).optional(),
  CHROMA_URL:        Joi.string().uri().optional(),
  CHROMA_COLLECTION: Joi.string().optional(),

  // Test-only — never required in production
  DATABASE_URL_TEST: Joi.string().pattern(/^postgres(ql)?:\/\//).optional(),
  EtE_TEST_USERNAME: Joi.string().email().optional(),
  EtE_TEST_PASSWORD: Joi.string().optional(),
}).options({ allowUnknown: true });
