// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, 'Content-Type': 'application/json' }, status,
  })
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
))

// Sends one confirmation email for a freshly created booking. The recipient
// and every detail come from the appointment row itself, so this can't be
// used to send arbitrary emails.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // User JWT for logged-in customers, anon key for guests
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not set' }, 500)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let claimedId = null

  try {
    const { appointmentId } = await req.json()
    if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
      return json({ error: 'appointmentId required' }, 400)
    }

    const { data: appt } = await admin.from('appointments')
      .select('id, user_id, date, time, notes, payment_status, payment_intent_id, guest_name, guest_email, created_at, confirmation_sent_at, services(name, price), stylists(name), profiles(full_name, email)')
      .eq('id', appointmentId).maybeSingle()
    if (!appt) return json({ error: 'Appointment not found' }, 404)

    // A customer's booking can only be confirmed by that customer
    if (appt.user_id) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user } } = await userClient.auth.getUser()
      if (user?.id !== appt.user_id) return json({ error: 'Forbidden' }, 403)
    }

    if (Date.now() - new Date(appt.created_at).getTime() > 30 * 60 * 1000) {
      return json({ error: 'Too late to send a confirmation for this booking' }, 400)
    }

    // Claim the send so the same booking can't trigger repeat emails
    const { data: claimed } = await admin.from('appointments')
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('id', appt.id).is('confirmation_sent_at', null).select('id')
    if (!claimed?.length) return json({ ok: true, alreadySent: true })
    claimedId = appt.id

    const to = appt.user_id ? appt.profiles?.email : appt.guest_email
    if (!to) throw new Error('No email address on this booking')

    const paymentStatus = appt.payment_status
    const isInStore = paymentStatus === 'pay_in_store'

    let priceNum = parseFloat(appt.services?.price ?? 0)
    if (appt.payment_status === 'paid' && appt.payment_intent_id && Deno.env.get('STRIPE_SECRET_KEY')) {
      const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(appt.payment_intent_id)}`, {
        headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
      })
      if (res.ok) priceNum = (await res.json()).amount_received / 100
    } else {
      const m = /Final: \$(\d+(?:\.\d{1,2})?)\]/.exec(appt.notes ?? '')
      if (m) priceNum = Math.min(priceNum, parseFloat(m[1]))
    }

    const rawService = appt.services?.name ?? 'Appointment'
    const rawDate = new Date(`${appt.date}T00:00:00Z`).toLocaleDateString('en-NZ', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
    const rawTime = String(appt.time).slice(0, 5)

    const name    = escapeHtml(appt.user_id ? (appt.profiles?.full_name || 'there') : (appt.guest_name || 'there'))
    const service = escapeHtml(rawService)
    const stylist = escapeHtml(appt.stylists?.name ?? '')
    const date    = escapeHtml(rawDate)
    const time    = escapeHtml(rawTime)
    const price   = escapeHtml(priceNum.toFixed(2))

    const subject = `Confirmed: ${rawService} on ${rawDate} at ${rawTime} — HairGo`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Appointment Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#F5F2ED;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F2ED;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Logo bar -->
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <p style="margin:0;font-size:30px;font-weight:300;color:#1a1212;font-family:Georgia,serif;letter-spacing:0.02em;">
              Hair<strong style="color:#C9A84C;">Go</strong>
            </p>
            <p style="margin:4px 0 0;font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:#9b8e82;font-family:Arial,sans-serif;">
              Auckland&nbsp;&nbsp;·&nbsp;&nbsp;Hair Studio
            </p>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#FFFFFF;border-radius:16px;border:1px solid #E8E2DA;overflow:hidden;">

            <!-- Gold top stripe -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="height:4px;background:linear-gradient(90deg,#C9A84C,#C4956A,#e8c97a);font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- Header -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 40px 24px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 14px;background:#FBF7EE;border:1px solid #E8D9B0;border-radius:20px;">
                        <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#C9A84C;font-family:Arial,sans-serif;font-weight:700;">Confirmed</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;font-size:24px;font-weight:300;color:#1a1212;font-family:Georgia,serif;line-height:1.2;">
                    Your appointment<br>is all set, <strong>${name}</strong>.
                  </p>
                  <p style="margin:10px 0 0;font-size:13px;color:#9b8e82;font-family:Arial,sans-serif;line-height:1.6;">
                    We look forward to seeing you. Here's a summary of your booking.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:1px;background:#F0EBE3;margin:0 40px;font-size:0;">&nbsp;</td></tr>
            </table>

            <!-- Details -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:24px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;border-radius:12px;border:1px solid #EDE8E0;">
                    ${[
                      ['Service', service],
                      ['Stylist',  stylist],
                      ['Date',    date],
                      ['Time',    time],
                    ].map(([label, value], i, arr) => `
                    <tr>
                      <td style="padding:14px 20px;${i < arr.length - 1 ? 'border-bottom:1px solid #EDE8E0;' : ''}">
                        <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b0a396;font-family:Arial,sans-serif;">${label}</span>
                      </td>
                      <td style="padding:14px 20px;text-align:right;${i < arr.length - 1 ? 'border-bottom:1px solid #EDE8E0;' : ''}">
                        <span style="font-size:14px;color:#1a1212;font-family:Arial,sans-serif;font-weight:600;">${value}</span>
                      </td>
                    </tr>`).join('')}
                  </table>
                </td>
              </tr>
            </table>

            <!-- Price row -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 40px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#FBF7EE,#FDF9F2);border-radius:12px;border:1px solid #E8D9B0;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b0a396;font-family:Arial,sans-serif;">Total</span>
                      </td>
                      <td style="padding:16px 20px;text-align:right;">
                        <span style="font-size:22px;color:#C9A84C;font-family:Georgia,serif;font-weight:700;">$${price}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Payment status -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 40px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="${isInStore
                    ? 'background:#FFFBF0;border:1px solid #F0D98A;border-radius:12px;'
                    : 'background:#F0FBF6;border:1px solid #A8DFC2;border-radius:12px;'}">
                    <tr>
                      <td style="padding:14px 20px;">
                        <p style="margin:0;font-size:13px;line-height:1.65;font-family:Arial,sans-serif;${isInStore ? 'color:#92700A;' : 'color:#1A7A4A;'}">
                          ${isInStore
                            ? `<strong>Pay in store</strong> &mdash; please bring <strong>$${price}</strong> to the salon at the time of your appointment.`
                            : `<strong>&#10003;&nbsp; Payment received</strong> &mdash; your payment of <strong>$${price}</strong> has been successfully processed.`
                          }
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:28px 16px 0;">
            <p style="margin:0;font-size:11px;color:#b0a396;font-family:Arial,sans-serif;letter-spacing:0.06em;">
              HairGo &nbsp;&middot;&nbsp; Auckland, New Zealand
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#c8bfb4;font-family:Arial,sans-serif;">
              Questions? Reply to this email or visit us in store.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev',
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Resend error ${res.status}: ${body}`)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('send-appointment-confirmation error:', err.message)
    // Let a retry send it if this attempt failed
    if (claimedId) await admin.from('appointments').update({ confirmation_sent_at: null }).eq('id', claimedId)
    return json({ error: 'Could not send confirmation email' }, 400)
  }
})
