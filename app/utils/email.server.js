import nodemailer from "nodemailer";

export async function sendSupportEmail({ from, subject, message, shop, attachments = [] }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"AI Instafeed Support" <${process.env.SMTP_USER}>`,
    to: process.env.SUPPORT_EMAIL || "support@booststar.com",
    replyTo: from,
    subject: `[New Support Request] ${subject} - From ${shop}`,
    attachments: attachments,
    text: `You have received a new support request.\n\nShop: ${shop}\nClient Email: ${from}\nSubject: ${subject}\n\nMessage:\n${message}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; background-color: #f4f7f9; border-radius: 12px; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <h2 style="color: #e1306c; margin-top: 0; font-size: 22px; border-bottom: 2px solid #fce4ec; padding-bottom: 15px;">New Support Message</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: bold; width: 100px;">Shop:</td>
              <td style="padding: 10px 0; color: #111;">${shop}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: bold;">Sender:</td>
              <td style="padding: 10px 0; color: #111;">${from}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: bold;">Subject:</td>
              <td style="padding: 10px 0; color: #111;">${subject}</td>
            </tr>
          </table>

          <div style="margin-top: 25px; background: #fff5f8; padding: 25px; border-left: 4px solid #e1306c; border-radius: 8px;">
            <p style="margin: 0; line-height: 1.6; color: #444; font-size: 15px;">
              ${message}
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
            Sent from AI Instafeed Shopify App
          </div>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
}

export async function sendWelcomeEmail({ to, shop }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"Shivdutt | AI Instafeed" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `🚀 Welcome to AI Instafeed! Let's boost your store, ${shop}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; background-color: #f8fafc; border-radius: 16px; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #e1306c; margin: 0; font-size: 28px; font-weight: 800;">Welcome to AI Instafeed!</h1>
          <p style="color: #64748b; font-size: 16px; margin-top: 10px;">The most powerful Instagram feed for Shopify stores.</p>
        </div>

        <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi there,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Thank you for choosing <strong>AI Instafeed</strong> for your store, <strong>${shop}</strong>. We're thrilled to have you on board!
          </p>
          
          <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 15px;">Next steps to get started:</h3>
          <ul style="padding-left: 20px; color: #475569; line-height: 1.8;">
            <li><strong>Connect Instagram:</strong> Add your handle in the dashboard and our AI will do the rest.</li>
            <li><strong>Customize Design:</strong> Match your feed colors and layout to your theme perfectly.</li>
            <li><strong>Enable Embed:</strong> Don't forget to enable the "Instafeed" app embed in your Theme Editor.</li>
          </ul>

          <div style="margin-top: 35px; text-align: center;">
            <a href="https://${shop}/admin/apps/ai-instafeed" style="background-color: #e1306c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">Open Dashboard</a>
          </div>
        </div>

        <div style="margin-top: 40px; text-align: center; color: #94a3b8; font-size: 14px;">
          <p>Need help? Just reply to this email or visit our <a href="mailto:contact@booststar.in" style="color: #e1306c; text-decoration: none;">Support Center</a>.</p>
          <p style="margin-top: 20px;">© 2026 AI Instafeed by BOOST STAR Experts</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Welcome email sent: %s", info.messageId);
    return { success: true };
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return { success: false, error: error.message };
  }
}
