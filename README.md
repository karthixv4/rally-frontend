# Rally frontend

## Connect the Express API

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_API_URL` to the Express API origin, such as `https://rally-backend-six.vercel.app/api`.
3. The current Express backend provides these read endpoints, which the frontend now composes into the operations view:

   - `GET /api/campaigns`
   - `GET /api/campaigns/:campaignId`
   - `GET /api/campaigns/:campaignId/attendees`
   - `GET /api/campaigns/:campaignId/preferences-summary`
   - `GET /api/campaigns/:campaignId/tasks`
   - `GET /api/campaigns/:campaignId/waitlist`
   - `GET /api/campaigns/:campaignId/activity`

The campaigns endpoint may return either an array or `{ "data": [...] }`. If no API URL is configured or the server cannot be reached, the app uses built-in mock data so local design work remains uninterrupted.

For cookie-based authentication, the Express API must enable CORS with the frontend origin and `credentials: true`.
