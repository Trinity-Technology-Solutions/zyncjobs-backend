// Add this to routes/team.js for testing

// TEST ROUTE - Remove after testing
router.post('/test-email', async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"ZyncJobs Test" <${process.env.SMTP_EMAIL}>`,
      to: testEmail,
      subject: 'Test Email from ZyncJobs',
      html: `
        <h1>Test Email</h1>
        <p>If you receive this, your email configuration is working!</p>
        <p>Time: ${new Date().toISOString()}</p>
      `
    });
    
    res.json({ success: true, message: `Test email sent to ${testEmail}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});