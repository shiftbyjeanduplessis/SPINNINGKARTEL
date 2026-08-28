SPINNING KARTEL — ONE-PAGE BOOKING SITE PROTOTYPE

Open index.html in any modern browser.

WHAT WORKS
- Responsive one-page website.
- 20-bike capacity shown per session.
- Live-looking availability counters.
- Booking form.
- Simulated pay-and-confirm flow.
- Demo bookings reduce the remaining bike count in this browser using localStorage.
- A session marked 20/20 is closed.
- Walk-in policy is explained on the page.

BEFORE GOING LIVE
1. Edit app.js -> CONFIG.classes with the real class timetable, coach names and starting bookings.
2. Edit app.js -> CONFIG.price with the actual ride price.
3. Replace placeholder contact/location details if required.
4. Connect the booking records to a database/backend. localStorage is only for the prototype.
5. Connect payment properly (Yoco / PayFast / other gateway). The current checkout is a UI prototype.

QUICK PAYMENT DEMO
- app.js includes CONFIG.paymentUrl.
- If a single hosted payment link is inserted there, the payment button will redirect to it.
- A production setup should create a unique payment transaction server-side and only reserve the bike after payment confirmation/webhook.

FILES
index.html        site markup
styles.css        all visual styling
app.js            timetable / capacity / demo booking logic
assets/           logo + studio + class + storefront + bike images
