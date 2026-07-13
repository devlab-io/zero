import { Autumn, fetchPricingTable } from 'autumn-js';
import type { HonoContext } from '../ctx';
import { env } from '../env';
import { Hono } from 'hono';

// Passthrough sanitizer for the autumn customer body; the shape is the provider's
// AttachParams/CancelParams, so keep it loose and let the caller's types apply.
const sanitizeCustomerBody = (body: any) => {
  let bodyCopy = { ...body };
  delete bodyCopy.id;
  delete bodyCopy.name;
  delete bodyCopy.email;
  return bodyCopy;
};

type AutumnContext = {
  Variables: {
    customerData: {
      customerId: string;
      customerData: {
        name: string;
        email: string;
      };
    } | null;
  };
} & HonoContext;

// Devlab self-host: when no AUTUMN_SECRET_KEY is configured, billing is disabled
// and every /api/autumn/* route answers with a permissive stub. Without this,
// the frontend's useBilling() hook receives an error and force-signs the user out.
const selfHostFeature = {
  unlimited: true,
  balance: 999999,
  usage: 0,
  included_usage: 999999,
  next_reset_at: null,
  interval: 'month',
  enabled: true,
};

const selfHostCustomer = (id: string, name: string, email: string) => ({
  id,
  name,
  email,
  // 'pro-example' matches the frontend's PRO_PLANS list → unlocks all Pro gates in self-host
  products: [{ id: 'pro-example', name: 'Pro (Self-hosted)', status: 'active' }],
  features: {
    'chat-messages': { id: 'chat-messages', ...selfHostFeature },
    connections: { id: 'connections', ...selfHostFeature },
    'brain-activity': { id: 'brain-activity', ...selfHostFeature },
  },
});

export const autumnApi = new Hono<AutumnContext>()
  .use('*', async (c, next) => {
    const { sessionUser } = c.var;
    c.set(
      'customerData',
      !sessionUser
        ? null
        : {
            customerId: sessionUser.id,
            customerData: {
              name: sessionUser.name,
              email: sessionUser.email,
            },
          },
    );
    if (!env.AUTUMN_SECRET_KEY) {
      const { customerData } = c.var;
      if (!customerData) return c.json({ error: 'No customer ID found' }, 401);
      const path = c.req.path;
      if (path.endsWith('/customers'))
        return c.json(
          selfHostCustomer(
            customerData.customerId,
            customerData.customerData.name,
            customerData.customerData.email,
          ),
        );
      if (path.endsWith('/check')) return c.json({ allowed: true, balance: 999999 });
      if (path.endsWith('/track')) return c.json({ success: true });
      if (path.endsWith('/pricing_table')) return c.json({ list: [] });
      if (path.includes('/entities')) return c.json({ list: [] });
      // attach / cancel / billing portals: billing is not available in self-host
      return c.json({ error: 'Billing disabled in self-hosted mode' }, 200);
    }
    c.set('autumn', new Autumn({ secretKey: env.AUTUMN_SECRET_KEY }));
    await next();
  })
  .post('/customers', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!.customers
        .create({
          id: customerData.customerId,
          ...customerData.customerData,
          ...sanitizeCustomerBody(body),
        })
        .then((data) => data.data),
    );
  })
  .post('/attach', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!
        .attach({
          ...sanitizedBody,
          customer_id: customerData.customerId,
          customer_data: customerData.customerData,
        })
        .then((data) => data.data),
    );
  })
  .post('/cancel', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!
        .cancel({
          ...sanitizedBody,
          customer_id: customerData.customerId,
        })
        .then((data) => data.data),
    );
  })
  .post('/check', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!
        .check({
          ...sanitizedBody,
          customer_id: customerData.customerId,
          customer_data: customerData.customerData,
        })
        .then((data) => data.data),
    );
  })
  .post('/track', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!
        .track({
          ...sanitizedBody,
          customer_id: customerData.customerId,
          customer_data: customerData.customerData,
        })
        .then((data) => data.data),
    );
  })
  .post('/billing_portal', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!.customers
        .billingPortal(customerData.customerId, body)
        .then((data) => data.data),
    );
  })
  .post('/openBillingPortal', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!.customers
        .billingPortal(customerData.customerId, {
          ...body,
          return_url: `${env.VITE_PUBLIC_APP_URL}`,
        })
        .then((data) => data.data),
    );
  })
  .post('/entities', async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    return c.json(
      await autumn!.entities.create(customerData.customerId, body).then((data) => data.data),
    );
  })
  .get('/entities/:entityId', async (c) => {
    const { autumn, customerData } = c.var;
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    const entityId = c.req.param('entityId');
    const expand = c.req.query('expand')?.split(',') as 'invoices'[] | undefined;

    if (!entityId) {
      return c.json(
        {
          error: 'no_entity_id',
          message: 'Entity ID is required',
        },
        400,
      );
    }

    return c.json(
      await autumn!.entities
        .get(customerData.customerId, entityId, { expand })
        .then((data) => data.data),
    );
  })
  .delete('/entities/:entityId', async (c) => {
    const { autumn, customerData } = c.var;
    if (!customerData) return c.json({ error: 'No customer ID found' }, 401);

    const entityId = c.req.param('entityId');

    if (!entityId) {
      return c.json(
        {
          error: 'no_entity_id',
          message: 'Entity ID is required',
        },
        400,
      );
    }

    return c.json(
      await autumn!.entities.delete(customerData.customerId, entityId).then((data) => data.data),
    );
  })
  .get('/components/pricing_table', async (c) => {
    const { autumn, customerData } = c.var;

    return c.json(
      await fetchPricingTable({
        instance: autumn!,
        params: {
          customer_id: customerData?.customerId || undefined,
        },
      }).then((data) => data.data),
    );
  });
