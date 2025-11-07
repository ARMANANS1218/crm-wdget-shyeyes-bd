import sgMail from '@sendgrid/mail';

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@shyeyes.com';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid configured successfully');
} else {
  console.log('⚠️ SendGrid API key not found, falling back to SMTP');
}

// SendGrid email sender
export const sendMailViaSendGrid = async (to, subject, html) => {
  try {
    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured');
    }

    console.log(`📧 Sending email via SendGrid to: ${to}`);
    console.log(`📧 Using sender email: ${EMAIL_FROM}`);
    
    const msg = {
      to,
      from: EMAIL_FROM,
      subject,
      html,
    };

    const result = await sgMail.send(msg);
    console.log(`✅ Email sent via SendGrid to: ${to}`);
    
    return { 
      success: true, 
      messageId: result[0].headers['x-message-id'],
      service: 'sendgrid'
    };
  } catch (error) {
    console.error('❌ SendGrid email error:', error.message);
    console.error('❌ SendGrid error details:', {
      code: error.code,
      message: error.message,
      response: error.response?.body
    });
    
    // Handle specific SendGrid errors
    let errorMessage = error.message;
    if (error.code === 403) {
      errorMessage = `Sender email '${EMAIL_FROM}' is not verified in SendGrid. Please verify it in SendGrid dashboard.`;
      console.error('🚨 SendGrid Verification Required:', {
        solution: 'Go to https://app.sendgrid.com/settings/sender_auth and verify the sender email',
        email: EMAIL_FROM
      });
    }
    
    return { 
      success: false, 
      error: errorMessage,
      service: 'sendgrid',
      needsVerification: error.code === 403
    };
  }
};

export default sendMailViaSendGrid;