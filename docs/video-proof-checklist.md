# Hackathon video proof checklist

The official requirements say the demo video must show the application working and visibly prove that its backend runs on Google Cloud. The video must be no longer than four minutes and must be publicly visible on YouTube or Vimeo.

## Open these tabs before recording

1. **Public app:** <https://bumps-phi.vercel.app>
2. **Cloud Run services:** <https://console.cloud.google.com/run?project=project-1ba74e2d-51e2-4753-b63> — open `bumps-api`.
3. **Cloud Run logs:** <https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22bumps-api%22?project=project-1ba74e2d-51e2-4753-b63>
4. **Cloud SQL instance:** <https://console.cloud.google.com/sql/instances/bumps-postgres/overview?project=project-1ba74e2d-51e2-4753-b63>
5. **Live Google Cloud endpoint:** <https://bumps-api-1096378308677.asia-south1.run.app>
6. **Code repository:** <https://github.com/vimzh/bumps>
7. **Architecture and setup instructions:** <https://github.com/vimzh/bumps#readme>
8. **Official submission requirements:** <https://allthingsagentichackathon.devpost.com/#requirements>
9. **Official FAQ:** <https://allthingsagentichackathon.devpost.com/details/faqs>

## What to show in the final 30 seconds

- **3:30:** Cloud Run service page. Point to service `bumps-api`, region `asia-south1`, and active revision `bumps-api-00002-48p`.
- **3:36:** Cloud Run logs. Show a recent line containing `model: gemini-3.7-flash` and `backend: VERTEX_AI`.
- **3:43:** Cloud SQL overview. Point to `bumps-postgres`, PostgreSQL 17, region `asia-south1`, and the running state.
- **3:49:** Open the live `.run.app` endpoint with the browser address bar visible. Its JSON response should show `"ok": true`, `"provider": "gemini"`, and the Gemini model names.
- **3:55:** Return to the finished tactile map for the closing sentence.

## Submission items outside the video

- Select one category: **The Taskmaster**.
- Add the hosted-project URL: <https://bumps-phi.vercel.app>.
- Add the repository URL and ensure judges can access it. The repository is currently private, so share it with `testing@devpost.com` and `cloudhackathons@google.com`, or make it public before submission.
- Keep the README’s local spin-up and cloud-deployment instructions current.
- Include the architecture diagram from the README.
- Upload the demo publicly to YouTube or Vimeo. Do not use an unlisted video.
- Keep the submitted video, repository, and hosted application unchanged during judging.

## Recording safety

- Pre-open and sign in to Google Cloud Console before recording.
- Hide account emails, billing details, tokens, secret values, and database connection strings.
- Keep the browser address bar visible when showing the `.run.app` endpoint.
- Run one real agent action before the proof segment so the Vertex AI log line is recent and easy to find.
