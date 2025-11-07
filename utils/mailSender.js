import nodemailer from "nodemailer";

// ✅ Try SendGrid first (cloud-friendly), fallback to SMTP
let sendGridAvailable = false;
let sendMailViaSendGrid = null;

try {
  const sendGridModule = await import('./sendGridMailer.js');
  sendMailViaSendGrid = sendGridModule.sendMailViaSendGrid;
  sendGridAvailable = !!process.env.SENDGRID_API_KEY;
  console.log(`📧 SendGrid status: ${sendGridAvailable ? 'Available' : 'Not configured'}`);
} catch (error) {
  console.log('📧 SendGrid not available, using SMTP only');
}

// ✅ Gmail SMTP configuration with app password (fallback)
const transporter = nodemailer.createTransport({
  service: 'gmail', // Use Gmail service for better compatibility
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587, // Use 587 for production (STARTTLS)
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || "shyeyes@bitmaxtest.com",
    pass: process.env.EMAIL_PASS || "divya@123", // Gmail app password (no spaces)
  },
  tls: {
    rejectUnauthorized: false,
  },
  pool: true, // ✅ connection reuse
  maxConnections: 5,
  maxMessages: 100,
  // Add timeouts for better reliability
  connectionTimeout: 30000, // 30 seconds (reduced for faster failure)
  greetingTimeout: 15000, // 15 seconds  
  socketTimeout: 30000, // 30 seconds
});
 
// ✅ Verify SMTP connection once (only at startup)
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP Connection Failed:", error.message);
    console.error("❌ SMTP Error Details:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASS
    });
  } else {
    console.log("✅ SMTP Server Ready to Send Emails");
    console.log("✅ SMTP Config:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.EMAIL_USER
    });
  }
});
 
// ✅ Multi-service email sender with fallback
export const sendMail = async (to, subject, html) => {
  // Strategy 1: Try SendGrid first (cloud-friendly)
  if (sendGridAvailable && sendMailViaSendGrid) {
    console.log('📧 Attempting SendGrid first...');
    try {
      const sendGridResult = await sendMailViaSendGrid(to, subject, html);
      if (sendGridResult.success) {
        console.log('✅ Email sent successfully via SendGrid');
        return sendGridResult;
      }
      console.log('⚠️ SendGrid failed, trying SMTP fallback...');
    } catch (error) {
      console.log('⚠️ SendGrid error, trying SMTP fallback:', error.message);
    }
  }

  // Strategy 2: Fallback to SMTP
  try {
    console.log(`📧 Attempting SMTP to: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 SMTP Config Check:`, {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASS,
      environment: process.env.NODE_ENV
    });

    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      const error = new Error('Email configuration missing: EMAIL_USER or EMAIL_PASS not set');
      console.error('❌ Email config error:', error.message);
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
      from: `"ShyEyes" <${process.env.EMAIL_USER}>`, // sender address
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent successfully via SMTP to: ${to} | Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId, service: 'smtp' };
    
  } catch (error) {
    console.error("❌ SMTP email sending error:", error.message);
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

    // Strategy 3: Mock success in development if all email services fail
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Mocking email success for testing');
      return { 
        success: true, 
        messageId: 'dev-mock-' + Date.now(),
        service: 'mock',
        note: 'Email mocked in development - check console for OTP'
      };
    }

    return { success: false, error: userMessage, originalError: error.message, service: 'smtp' };
  }
};
 
export default transporter;

