import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// `secure` must match the port: 465 => true (implicit TLS),
// 587/25 => false (STARTTLS). SMTP_SECURE can override explicitly.
const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
const smtpSecure =
    process.env.SMTP_SECURE !== undefined && process.env.SMTP_SECURE !== ""
        ? process.env.SMTP_SECURE === "true"
        : smtpPort === 465;

// Falls back to the authenticated mailbox so a valid sender is always set.
const FROM = process.env.SMTP_EMAIL_FROM || process.env.SMTP_EMAIL;

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
    },
});

const sendMail = async (to, subject, text, html, from = FROM) => {
    // Validate email and other inputs
    if (!to || !subject || !html) {
        console.error(
            "Invalid parameters: 'to', 'subject', and 'html' are required."
        );
        throw new Error("Invalid parameters for sending email.");
    }

    // Construct the footer HTML
    html += `<br><br>
    <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 20px; font-family: Arial, sans-serif; color: #555;">
        <img src="https://raw.githubusercontent.com/rahoolsingh/Backend/refs/heads/master/public/assets/logo-white-border.png" alt="Logo" width="200" height="auto" style="display: block; margin: 0;">
        <p style="font-size: 16px; font-weight: bold; margin: 0;">Data Management by DRS Tech</p>
        <p style="font-size: 12px; margin: 5px 0;">&copy; ${new Date().getFullYear()} DRS Tech. All rights reserved.</p>
        
        <div style="margin-top: 20px; font-size: 12px; color: #777;">
            <h4 style="margin: 5px 0;">Terms and Conditions</h4>
            <p style="margin: 5px 0;">By using our services, you agree to comply with our <a href="#" style="color: #1a73e8; text-decoration: none;">Terms and Conditions</a>.</p>
            <p style="margin: 5px 0;">For any inquiries, please contact us at: <a href="mailto:" style="color: #1a73e8; text-decoration: none;">#</a></p>
        </div>

        <p style="font-size: 10px; margin-top: 10px; color: #999;">
            This email and any attachments may contain confidential information. If you are not the intended recipient, please notify the sender and delete this email. 
            <span style="font-size: 8px;">MID: ${Date.now()}</span>
        </p>
    </div>`;

    const mailOptions = {
        from,
        to,
        subject,
        text,
        html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Message sent:", info.messageId);
        return info; // Return the info on success
    } catch (error) {
        // Log error without crashing the server
        console.error("Error sending email:", error);
        // You could also consider throwing the error here if you want to handle it at a higher level
        throw new Error("Failed to send email.");
    }
};

export default sendMail;
