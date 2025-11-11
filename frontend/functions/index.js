const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const {defineString} = require("firebase-functions/params");
const {Resend} = require("resend");

admin.initializeApp();

const db = admin.firestore();
const CONTACT_RECIPIENT = defineString("CONTACT_RECIPIENT", {
  defaultValue: "bradsgbaker14@gmail.com",
});
const RESEND_API_KEY = defineString("RESEND_API_KEY", {defaultValue: ""});
const RESEND_FROM = defineString("RESEND_FROM", {
  defaultValue: "Bethany Blooms via Resend <onboarding@resend.dev>",
});

const getParamValue = (param, fallback = "") => {
  try {
    const value = param.value();
    if (value !== undefined && value !== "") return value;
  } catch (error) {
    logger.debug(`Param ${param?.name ?? "unknown"} unavailable`, error?.message);
  }
  return fallback;
};

const contactRecipient = getParamValue(
  CONTACT_RECIPIENT,
  process.env.CONTACT_RECIPIENT || "bradsgbaker14@gmail.com",
);

const resendApiKey = getParamValue(
  RESEND_API_KEY,
  process.env.RESEND_API_KEY || "",
);
const resendFromAddress =
  getParamValue(RESEND_FROM, process.env.RESEND_FROM) ||
  "Bethany Blooms via Resend <onboarding@resend.dev>";
const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

exports.sendContactEmail = functions
  .region("us-central1")
  .https.onCall(async (data) => {
    const name = (data?.name || "").trim();
    const email = (data?.email || "").trim();
    const phone = (data?.phone || "").trim();
    const topic = (data?.topic || "").trim();
    const message = (data?.message || "").trim();
    const timeline = (data?.timeline || "").trim();

    if (!name || !email || !message) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Name, email, and message are required.",
      );
    }

    if (!resendClient) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Email transport is not configured. Add RESEND_API_KEY to your environment.",
      );
    }

    const plainText =
      `New contact message from ${name}\n\n` +
      `Email: ${email}\n` +
      (phone ? `Phone: ${phone}\n` : "") +
      (topic ? `Topic: ${topic}\n` : "") +
      (timeline ? `Timeline: ${timeline}\n` : "") +
      `\nMessage:\n${message}\n`;

    const htmlBody = `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ead7;padding:32px 0;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;color:#2f3624;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;padding:32px;box-shadow:0 25px 60px -35px rgba(47,54,36,0.35);">
              <tr>
                <td style="text-align:center;padding-bottom:16px;">
                  <h2 style="margin:0;font-family:'Droid Serif',Georgia,serif;color:#556b2f;">New Bethany Blooms enquiry</h2>
                  <p style="margin:8px 0 0;color:rgba(47,54,36,0.75);">Someone reached out through the website contact form.</p>
                </td>
              </tr>
              <tr>
                <td>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(85,107,47,0.18);border-radius:18px;overflow:hidden;">
                    <tbody>
                      ${[
                        {label: "Name", value: name},
                        {label: "Email", value: `<a href="mailto:${email}" style="color:#556b2f;text-decoration:none;">${email}</a>`},
                        phone ? {label: "Phone", value: phone} : null,
                        topic ? {label: "Topic", value: topic} : null,
                        timeline ? {label: "Timeline", value: timeline} : null,
                      ]
                        .filter(Boolean)
                        .map(
                          (row, index) => `
                            <tr style="background:${index % 2 === 0 ? "#ffffff" : "#f8f4ec"};">
                              <td style="padding:14px 18px;font-weight:600;width:160px;border-right:1px solid rgba(85,107,47,0.08);">${row.label}</td>
                              <td style="padding:14px 18px;">${row.value}</td>
                            </tr>
                          `,
                        )
                        .join("")}
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding-top:24px;">
                  <p style="margin:0 0 8px;font-weight:600;">Message</p>
                  <div style="padding:16px 20px;border-radius:16px;background:#f8f4ec;border:1px solid rgba(85,107,47,0.15);line-height:1.6;">
                    ${message.replace(/\n/g, "<br/>")}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding-top:28px;text-align:center;font-size:0.9rem;color:rgba(47,54,36,0.6);">
                  <p style="margin:0;">This email was delivered via Resend.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    const emailSubject = `Bethany Blooms contact: ${topic || "New enquiry"} from ${name}`;
    let emailError = null;
    try {
      const {error} = await resendClient.emails.send({
        from: resendFromAddress,
        to: contactRecipient,
        subject: emailSubject,
        html: htmlBody,
        text: plainText,
        reply_to: `${name} <${email}>`,
      });
      emailError = error ?? null;
    } catch (error) {
      emailError = error;
    }

    if (emailError) {
      logger.error("Resend email failed", emailError);
      throw new functions.https.HttpsError(
        "internal",
        emailError?.message || "Unable to send email at this time.",
      );
    }

    await db.collection("contactMessages").add({
      name,
      email,
      phone: phone || null,
      topic: topic || null,
      timeline: timeline || null,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {ok: true};
  });
