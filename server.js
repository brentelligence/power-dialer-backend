import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import twilio from 'twilio';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends urlencoded requests

const port = process.env.PORT || 3001;

// Firebase Firestore setup
const firebaseConfig = {
  apiKey: "AIzaSyAgyRxp44gqvaSUHqkaUX_HWRgHpCQVNew",
  authDomain: "power-dialer-5aef5.firebaseapp.com",
  projectId: "power-dialer-5aef5",
  storageBucket: "power-dialer-5aef5.firebasestorage.app",
  messagingSenderId: "36464616552",
  appId: "1:36464616552:web:6ff3e028e172e5647247dd",
  measurementId: "G-TEZPQPDKM3"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Webhook endpoint for Zapier to push leads directly without OAuth issues
app.post('/api/leads', async (req, res) => {
  try {
    const { name, phone, property, status } = req.body;
    console.log('Incoming lead from webhook:', req.body);
    const docRef = await addDoc(collection(db, 'leads'), {
      name: name || 'Unknown Lead',
      phone: phone || '',
      property: property || 'No Address',
      status: status || 'New Lead',
      createdAt: new Date().toISOString()
    });
    console.log('Lead created in Firestore with ID:', docRef.id);
    res.status(200).json({ success: true, id: docRef.id });
  } catch (err) {
    console.error('Error writing lead to Firestore:', err);
    res.status(500).json({ error: err.message });
  }
});

// You need to set these in your .env file
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;

app.post('/voice', (req, res) => {
  const to = req.body.To;
  const response = new twilio.twiml.VoiceResponse();

  if (to) {
    let formattedTo = String(to).replace(/\D/g, '');
    if (formattedTo.length === 10) formattedTo = '+1' + formattedTo;
    else if (formattedTo.length === 11 && formattedTo.startsWith('1')) formattedTo = '+' + formattedTo;
    else formattedTo = to;

    const callerId = req.body.CallerId || req.body.From || process.env.TWILIO_CALLER_ID || process.env.TWILIO_PHONE_NUMBER || '+14195744224';
    const dialOptions = {
      callerId: callerId,
      answerOnBridge: true
    };

    const dial = response.dial(dialOptions);
    dial.number({
      machineDetection: 'Enable',
      amdStatusCallback: 'https://power-dialer-backend.onrender.com/amd-callback',
      amdStatusCallbackMethod: 'POST'
    }, formattedTo);
  } else {
    response.say('No phone number provided.');
  }

  console.log('Generated TwiML for Outbound Call to:', to);
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
