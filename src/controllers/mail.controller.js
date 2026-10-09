import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * `secure` must match the port:
 *   465 => implicit TLS (true), 587/25 => STARTTLS (false).
 * SMTP_SECURE can override explicitly.
 */
const resolveSmtpConfig = () => {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const secure =
        process.env.SMTP_SECURE !== undefined && process.env.SMTP_SECURE !== ""
            ? process.env.SMTP_SECURE === "true"
            : port === 465;

    return {
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    };
};

const senderAddress = () =>
    process.env.SMTP_EMAIL_FROM || process.env.SMTP_EMAIL;

let cachedTransporter = null;
const getTransporter = () => {
    if (!cachedTransporter) {
        cachedTransporter = nodemailer.createTransport(resolveSmtpConfig());
    }
    return cachedTransporter;
};

const sanitizeError = (error) => {
    if (!error) return "Unknown error";
    const parts = [error.code, error.command, error.responseCode, error.message]
        .filter(Boolean)
        .map(String);
    return parts.join(" | ") || "Unknown error";
};

const sendMail = (to, subject, text, html, attachments, from = senderAddress()) => {
    const mailOptions = {
        from,
        to,
        subject,
        text,
        html,
        attachments,
    };

    return new Promise((resolve, reject) => {
        getTransporter().sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", sanitizeError(error));
                reject(error);
            } else {
                console.log("Message sent:", info.messageId);
                resolve(info);
            }
        });
    });
};

/**
 * Returns `{ sent, messageId, error }` instead of swallowing failures, so the
 * caller can persist delivery status and offer a safe retry.
 */
const sendWithAttachment = async (to, subject, text, html, filename, filePath) => {
    try {
        // Without a recipient, or without both attachment fields, send a plain
        // email (matches the previous optional-attachment behaviour).
        const attachments =
            filename && filePath
                ? [{ filename, path: filePath }]
                : undefined;

        const info = await sendMail(to, subject, text, html, attachments);
        console.log("Email sent successfully with attachment!");
        return { sent: true, messageId: info.messageId || null, error: null };
    } catch (error) {
        console.error("Failed to send email with attachment:", sanitizeError(error));
        return { sent: false, messageId: null, error: sanitizeError(error) };
    }
};

export { sendMail, sendWithAttachment, resolveSmtpConfig };
