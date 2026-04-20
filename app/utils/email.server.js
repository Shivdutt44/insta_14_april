import nodemailer from "nodemailer";

export async function sendSupportEmail({ from, subject, message, shop }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
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

          <div style="margin-top: 25px; background: #fff5f8; padding: 20px; border-left: 4px solid #e1306c; border-radius: 4px;">
            <p style="margin: 0; line-height: 1.6; color: #444; font-size: 15px;">
              ${message.replace(/\n/g, '<br />')}
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
