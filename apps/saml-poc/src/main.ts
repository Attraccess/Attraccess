import cookieSession from 'cookie-session';
import express from 'express';
// import helmet from 'helmet';
import passport from 'passport';
import { Profile, Strategy, VerifiedCallback } from '@node-saml/passport-saml';

const PORT = 3000;

/**
 * passport
 */
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// SAML strategy for passport -- Single IDP
const strategy = new Strategy(
  {
    entryPoint: process.env.SSO_ENTRYPOINT,
    issuer: process.env.SSO_ISSUER,
    callbackUrl: process.env.SSO_CALLBACK_URL,
    idpCert: process.env.SSO_CERT,
    // Keycloak currently signs only the SAML Response, not the Assertion itself.
    // node-saml defaults to wantAssertionsSigned=true, which caused the signature validation to fail.
    wantAssertionsSigned: false,

    // wantAssertionsSigned: false, // less secure way to avoid "Invalid signature" error
    // audience: process.env.SSO_ISSUER, // the default for `audience` is the value of `issuer`. Can be set to `false` to disable audience verification.
  },
  (profile: Profile, done: VerifiedCallback) => done(null, profile),
  (profile: Profile, done: VerifiedCallback) => done(null, profile),
);

passport.use(strategy);

/**
 * express
 */
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '15mb' }));
app.use(
  cookieSession({
    name: 'cooksess',
    secret: process.env.SSO_COOKIE_SESSION_SECRET,
  }),
);
// app.use(helmet());
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  console.log('app.js, /, req.session', (req as any).session);

  // read user from cookie-based session stored in POST /login/sso/callback
  if ((req as any).session.user) {
    res.send(`User: <pre>${JSON.stringify((req as any).session.user, null, 2)}</pre>`);
  } else {
    res.send('<a href="/login/sso">Login</a>');
  }
});

// This Route Authenticates req with IDP
// If Session is active it returns saml response
// If Session is not active it redirects to IDP's login form
app.get(
  '/login/sso',
  passport.authenticate('saml', {
    successRedirect: '/',
    failureRedirect: '/login/sso',
  }),
);

// This is the callback URL
// https://www.antoniogioia.com/saml-sso-setup-with-express-and-passport/
app.post('/login/sso/callback', (req, res, next) => {
  if (process.env.LOG_SAML_RESPONSE === 'true' && req.body?.SAMLResponse) {
    try {
      const xml = Buffer.from(req.body.SAMLResponse, 'base64').toString('utf-8');
      console.log('Decoded SAMLResponse:\n', xml);
    } catch (decodeErr) {
      console.error('Failed to decode SAMLResponse for logging', decodeErr);
    }
  }

  passport.authenticate('saml', (err: any, user?: Express.User | false | null) => {
    if (err) {
      console.error('app.js, /login/sso/callback, err', err);
    }
    console.log('app.js, /login/sso/callback, user', user);

    // store user in cookie-based session
    (req as any).session.user = user;
    res.redirect('/');
  })(req, res, next);
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
