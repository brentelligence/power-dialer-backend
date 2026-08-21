import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import twilio from 'twilio';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends urlencoded requests

const port = process.env.PORT || 3001;

// You need to set these in your .env file
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;

app.post('/voice', (req, res) => {
  const to = req.body.To;
  const response = new twilio.twiml.VoiceResponse();

  if (to) {
    // Generate TwiML that initiates the call and enables AMD
    const dial = response.dial();
    dial.number({
      machineDetection: 'Enable',
      amdStatusCallback: '/amd-callback',
      amdStatusCallbackMethod: 'POST'
    }, to);
  } else {
    response.say('No phone number provided.');
  }

  console.log('Generated TwiML for Outbound Call with AMD');
  res.set('Content-Type', 'text/xml');
  res.send(response.toString());
});

app.post('/amd-callback', (req, res) => {
  console.log('--- AMD Callback Received ---');
  console.log('AnsweredBy:', req.body.AnsweredBy);
  // Options: human, machine_start, machine_end_beep, machine_end_silence, unknown
  
  if (req.body.AnsweredBy === 'machine_start') {
    console.log('ACTION: Voicemail detected. We can use Twilio REST API to hang up or leave a message here.');
  }

  res.sendStatus(200);
});



app.get('/token', (req, res) => {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET || !TWILIO_TWIML_APP_SID) {
        return res.status(500).json({ error: 'Missing Twilio credentials in .env' });
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: TWILIO_TWIML_APP_SID,
        incomingAllow: true, // Allow incoming calls
    });

    // Create an access token which we will sign and return to the client,
    // containing the grant we just created
    const token = new AccessToken(
        TWILIO_ACCOUNT_SID,
        TWILIO_API_KEY,
        TWILIO_API_SECRET,
        { identity: 'user_' + Math.floor(Math.random() * 1000) }
    );

    token.addGrant(voiceGrant);

    res.json({ token: token.toJwt() });
});

app.listen(port, () => {
    console.log(`Token server running on port ${port}`);
});
