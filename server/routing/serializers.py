from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from routing.services.here import Place

MAX_PLACE_LENGTH = 200


class PlaceSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(max_length=MAX_PLACE_LENGTH)


class PlaceField(serializers.Field):
    """Search text (returned as a string) or {lat, lng, label} (returned as a Place)."""

    default_error_messages = {
        "invalid": "Must be a place name or an object with lat, lng and label."
    }

    def to_internal_value(self, data) -> str | Place:
        if isinstance(data, str):
            return serializers.CharField(max_length=MAX_PLACE_LENGTH).run_validation(data)
        if not isinstance(data, dict):
            self.fail("invalid")
        place = PlaceSerializer(data=data)
        place.is_valid(raise_exception=True)
        return Place(**place.validated_data)


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceField()
    destination = PlaceField()
    departure_time = serializers.DateTimeField()
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=80_000)
    checkpoint_interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate_departure_time(self, value):
        now = timezone.now()
        if not now - timedelta(hours=1) <= value <= now + timedelta(days=7):
            raise serializers.ValidationError("Must be between 1 hour ago and 7 days from now.")
        return value
