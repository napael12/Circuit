from django.conf import settings
from django.http import HttpResponse
from django.views.generic import View


class FrontendIndexView(View):
    """Serves the built React app's index.html for any non-API route.

    In development the frontend is normally run separately via
    `npm run dev` (Vite dev server, proxying /api and /ws to this Django
    server -- see frontend/vite.config.ts). This view only matters once
    `npm run build` has produced frontend/dist/index.html, at which point
    `python manage.py runserver` alone serves the whole app (the "monosite"
    build described in the migration spec).
    """

    def get(self, request, *args, **kwargs):
        index_path = settings.FRONTEND_DIST / 'index.html'
        if not index_path.exists():
            return HttpResponse(
                'Frontend build not found. Run `npm run build` in frontend/, '
                'or run `npm run dev` there for local development instead of '
                'loading the backend directly.',
                status=501,
            )
        return HttpResponse(index_path.read_text(encoding='utf-8'))
