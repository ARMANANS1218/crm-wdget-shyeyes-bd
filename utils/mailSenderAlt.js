import nodemailer from "nodemailer";

// Alternative email configuration for cloud platforms that block SMTP
const createEmailTransporter = () => {
  // Try multiple configurations based on environment
  const configs = [
    // Configuration 1: Port 587 with STARTTLS (most compatible with cloud providers)
    {
      name: "Gmail STARTTLS (587)",
      config: {
        service: 'gmail',
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      }
    },
    // Configuration 2: Gmail service (lets nodemailer handle the details)
    {
      name: "Gmail Service",
      config: {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        }
      }
    },
    // Configuration 3: Port 465 with SSL (fallback)
    {
      name: "Gmail SSL (465)",
      config: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      }
    }
  ];

  // Try each configuration
  for (const { name, config } of configs) {
    try {
      console.log(`📧 Trying email config: ${name}`);
      const transporter = nodemailer.createTransport(config);
      return { transporter, configName: name };
    } catch (error) {
      console.log(`❌ Failed to create transporter with ${name}:`, error.message);
    }
  }

  throw new Error('Failed to create email transporter with any configuration');
};

// Create transporter with fallback
let transporterInfo;
try {
  transporterInfo = createEmailTransporter();
  console.log(`✅ Email transporter created with: ${transporterInfo.configName}`);
} catch (error) {
  console.error('❌ Failed to create email transporter:', error.message);
}

const transporter = transporterInfo?.transporter;

// ✅ Verify SMTP connection once (only at startup)
if (transporter) {
  transporter.verify((error, success) => {
    if (error) {
      console.error("❌ SMTP Connection Failed:", error.message);
      console.error("❌ SMTP Error Details:", {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.EMAIL_USER,
        hasPassword: !!process.env.EMAIL_PASS,
        configUsed: transporterInfo.configName
      });
    } else {
      console.log("✅ SMTP Server Ready to Send Emails");
      console.log("✅ SMTP Config:", {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.EMAIL_USER,
        configUsed: transporterInfo.configName
      });
    }
  });
}

// ✅ Exported mail sender function with enhanced error handling
export const sendMail = async (to, subject, html) => {
  try {
    console.log(`📧 Attempting to send email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Using config: ${transporterInfo?.configName}`);

    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      const error = new Error('Email configuration missing: EMAIL_USER or EMAIL_PASS not set');
      console.error('❌ Email config error:', error.message);
      return { success: false, error: error.message };
    }

    if (!transporter) {
      const error = new Error('Email transporter not available');
      console.error('❌ Transporter error:', error.message);
      return { success: false, error: error.message };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      const error = new Error('Invalid email format');
      console.error('❌ Email format error:', error.message);
      return { success: false, error: error.message };
    }
    
    const info = await transporter.sendMail({
      from: `"ShyEyes" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent successfully to: ${to} | Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending error:", error.message);
    console.error("❌ Full error details:", {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack
    });

    // Provide specific error messages for common issues
    let userMessage = error.message;
    if (error.code === 'EAUTH') {
      userMessage = 'Email authentication failed. Please check email credentials.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      userMessage = 'Email service temporarily unavailable. Please try again later.';
    } else if (error.code === 'EMESSAGE') {
      userMessage = 'Invalid email content. Please contact support.';
    }

    return { success: false, error: userMessage, originalError: error.message };
  }
};

export default transporter;