# Spinning Kartel V1 — Integration Contract

The UI and operating logic are built. The following live connections still require the real studio accounts/credentials.

## Booklink is the booking authority

Production must never maintain an independent seat count.

Required Booklink connection points:
1. Class/session schedule and capacity feed for the public homepage.
2. Official inline booking embed / direct session links.
3. Walk-in/manual booking creation before the rider is confirmed locally.
4. Roster/attendance data if Booklink exposes it.
5. Prepaid package redemption stays in Booklink using each client's private package link.
6. Monthly Unlimited is issued in Booklink as 100 credits / one month after PayFast payment is confirmed.

If Booklink does not expose an API for an operation, the management UI should link staff to the correct Booklink workflow rather than pretending the local action is authoritative.

## PayFast

Normal:
Booklink -> PayFast -> Booklink confirms booking/package.

Monthly Unlimited:
PayFast recurring subscription -> staff verifies successful monthly payment -> staff issues/renews 100-credit Booklink package -> tick reconciliation in Management.

Reception:
Card/EFT/cash/comp can be recorded locally, but every rider must still be created in Booklink before taking a bike.

## Staff auth

Current build uses a local demo OTP (246810).
Production recommendation: Supabase Auth email OTP/magic code, with roles:
- owner
- reception
- instructor

## Public rules

- Default class capacity: 20.
- Urgency: at 70% occupancy show ONLY X LEFT.
- Full: no online booking button.
- Online cutoff: 20 minutes before start.
- After cutoff: public shows ONLINE BOOKING CLOSED; reception may still add walk-ins if Booklink has capacity.
- Rates are visible on the homepage and schedule.

## Instructor pay

Default:
R200 base per taught class + R10 x max(actual attendance - 5, 0).

Walk-ins must be pushed into Booklink so capacity, roster, attendance and instructor commission reconcile.
