const payload = {
  notes: "Had a great chat. Wants a demo number and booking link. Going on holiday to Australia soon.",
  recipientEmail: "test@example.com",
  recipientName: "John Doe",
  senderAccount: "john",
  contactPhone: "123456789",
  contactWebsite: "Example Inc",
  contactAddress: "123 Test St",
  callOutcome: "completed",
  callDate: new Date().toISOString(),
  campaignName: "Test Campaign",
  inclusions: "send booking link and demo number"
};

fetch('https://n8n.arfquant.com/webhook/SendInfoEmail', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => {
  console.log('--- RESPONSE ---');
  console.log(JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error('--- ERROR ---');
  console.error(err);
});
