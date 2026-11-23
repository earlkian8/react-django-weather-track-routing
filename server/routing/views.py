from dataclasses import asdict

from rest_framework.response import Response
from rest_framework.views import APIView

from . import planner
from .serializers import PlanRequestSerializer
from .services import here

MIN_GEOCODE_QUERY = 3


class HealthView(APIView):
    def get(self, request):
        return Response({"status": "ok"})


class PlanView(APIView):
    throttle_scope = "plan"

    def post(self, request):
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(planner.create_plan(serializer.validated_data))


class HeatmapView(APIView):
    def get(self, request, plan_id):
        return Response(planner.build_heatmap(plan_id))


class GeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < MIN_GEOCODE_QUERY:
            return Response([])
        return Response([asdict(place) for place in here.geocode(query)])
