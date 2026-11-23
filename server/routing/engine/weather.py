"""An hourly forecast for one place, and how to read conditions out of it."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from .risk import Conditions

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class Forecast:
    """Hourly values from `start`. None marks an hour the provider has no value for."""

    start: datetime  # aware, on the hour
    wind_mph: list[float | None]  # instantaneous, as are gusts
    gust_mph: list[float | None]
    rain_in: list[float | None]  # total over the preceding hour, as is snow
    snow_in: list[float | None]

    def conditions_at(self, when: datetime) -> Conditions | None:
        """Conditions at a moment, or None if it's out of range or has no data."""
        elapsed = when - self.start
        if elapsed < timedelta(0):
            return None
        # An hour's total covers the hour before it, so `when` falls in the total
        # of the next hour mark (ceil). Wind is a snapshot, so the nearest is best.
        return self._conditions(
            wind_index=(elapsed + HOUR / 2) // HOUR, precip_index=-(-elapsed // HOUR)
        )

    def hour(self, index: int) -> Conditions | None:
        """Conditions at hour `index` from the start, or None as above."""
        return self._conditions(wind_index=index, precip_index=index)

    def _conditions(self, wind_index: int, precip_index: int) -> Conditions | None:
        last = len(self.wind_mph) - 1
        if min(wind_index, precip_index) < 0 or max(wind_index, precip_index) > last:
            return None
        wind = self.wind_mph[wind_index]
        rain = self.rain_in[precip_index]
        snow = self.snow_in[precip_index]
        if wind is None or rain is None or snow is None:
            return None
        return Conditions(
            wind_mph=wind, gust_mph=self.gust_mph[wind_index], rain_in=rain, snow_in=snow
        )
