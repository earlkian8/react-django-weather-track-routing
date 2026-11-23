# Weather-aware truck routing

Plans truck trips, compares up to three routes by the weather risk along each one, and recommends the safest.

## Backend

A Django REST API in `server/`. HERE provides geocoding and truck routes. Open-Meteo provides forecasts and needs no key.

```
server/routing/
  engine/       Pure logic, no I/O: risk, checkpoints, forecasts, ranking, heatmap grid
  services/     HERE and Open-Meteo clients
  planner.py    Combines the two into plans and heatmaps
  views.py      Validate, call the planner, return the result
```

### Setup

Needs Python 3.12 or newer and a [HERE API key](https://platform.here.com).

```bash
python3 -m venv venv
source venv/bin/activate
cd server
pip install -r requirements.txt
cp .env.example .env        # then set DJANGO_SECRET_KEY and HERE_API_KEY
python manage.py migrate
python manage.py runserver  # http://localhost:8000
```

Run the tests from `server/`. They use no network and no real API key.

```bash
pytest
```

### Endpoints

| Method | Path | Purpose | Limit per client |
| --- | --- | --- | --- |
| GET | `/api/health/` | Liveness check | none |
| GET | `/api/geocode/?q=` | Place search | 120 per minute |
| POST | `/api/plans/` | Plan a trip | 20 per minute |
| GET | `/api/plans/<id>/heatmap/` | Hourly risk around a plan's routes | none |

All times in responses are UTC ISO 8601.

#### `GET /api/geocode/?q=amarillo`

```json
[{"label": "Amarillo, TX, United States", "lat": 35.20728, "lng": -101.83411}]
```

Queries shorter than 3 characters return `[]`.

#### `POST /api/plans/`

```bash
curl http://localhost:8000/api/plans/ \
  -H 'Content-Type: application/json' \
  -d '{
    "origin": "Dallas, TX",
    "destination": {"lat": 39.74001, "lng": -104.99202, "label": "Denver, CO"},
    "departure_time": "2026-11-24T00:20:00Z",
    "load_weight_lb": 42000,
    "checkpoint_interval_mi": 25
  }'
```

| Field | Accepts |
| --- | --- |
| `origin`, `destination` | Search text (the first match is used) or `{lat, lng, label}` |
| `departure_time` | ISO datetime from 1 hour ago to 7 days ahead. Without a UTC offset it is read as UTC. |
| `load_weight_lb` | Whole number from 0 to 80,000 |
| `checkpoint_interval_mi` | 10, 25 or 50. Default 25. |

Response, shortened to one route, one checkpoint and two geometry points. Routes are listed best first.

```json
{
  "id": "205748ff-07a5-4345-9931-4c627a26195c",
  "origin": {"label": "Dallas, TX, United States", "lat": 32.77823, "lng": -96.7951},
  "destination": {"label": "Denver, CO", "lat": 39.74001, "lng": -104.99202},
  "departure_time": "2026-11-24T00:20:00Z",
  "load_weight_lb": 42000,
  "checkpoint_interval_mi": 25,
  "recommended_route_id": "A",
  "recommendation": "Shortest duration: 12 h 14 min vs 12 h 43 min on Route B.",
  "advisory": null,
  "routes": [
    {
      "id": "A",
      "name": "Route A",
      "rank": 1,
      "via": ["US-87", "US-287"],
      "distance_mi": 798.4,
      "duration_min": 734,
      "arrival_time": "2026-11-24T12:34:26Z",
      "geometry": [[-96.7951, 32.77823], [-96.79498, 32.77826]],
      "summary": {
        "miles_by_risk": {"low": 798.4, "moderate": 0.0, "high": 0.0, "severe": 0.0, "no_travel": 0.0},
        "no_travel_miles": 0.0,
        "severe_miles": 0.0,
        "high_miles": 0.0,
        "unknown_miles": 0.0,
        "avg_risk": 0.0,
        "worst_risk": "low"
      },
      "checkpoints": [
        {
          "mile": 0.0,
          "lat": 32.778231,
          "lng": -96.7951,
          "eta": "2026-11-24T00:20:00Z",
          "segment_miles": 12.5,
          "weather": {"wind_mph": 5.0, "gust_mph": 8.3, "rain_in_hr": 0.0, "snow_in_hr": 0.0},
          "risk": "low",
          "risk_label": "Low",
          "risk_level": 0,
          "factors": []
        }
      ]
    }
  ]
}
```

- `risk` is `low`, `moderate`, `high`, `severe` or `no_travel`, with `risk_level` 0 to 4.
- A checkpoint without a forecast has `weather: null`, `risk: "unknown"` and `risk_level: null`.
- `factors` gives a reason for each condition above Low, worst first, such as `"Wind 38 mph with 42,000 lb load (Severe)"`.
- `advisory` is text when every route has No Travel miles, otherwise `null`.

#### `GET /api/plans/<id>/heatmap/`

Available for 1 hour after the plan was made. Shortened to one cell and three hours:

```json
{
  "plan_id": "205748ff-07a5-4345-9931-4c627a26195c",
  "start": "2026-11-24T00:00:00Z",
  "hours": 49,
  "cell_size_deg": 0.3,
  "cells": [[32.4, -97.2]],
  "risk": [[0, 0, 0]],
  "wind": [[4.3, 4.7, 5.1]],
  "rain": [[0.0, 0.0, 0.0]],
  "snow": [[0.0, 0.0, 0.0]]
}
```

`risk[c][h]` is the risk level of `cells[c]` (a cell center, `[lat, lng]`) at `h` hours after `start`. `wind`, `rain` and `snow` are indexed the same way. Hours without data are `null`.

#### Errors

| Status | When | Body |
| --- | --- | --- |
| 400 | Invalid input | `{"load_weight_lb": ["Ensure this value is less than or equal to 80000."]}` |
| 400 | Place not found | `{"destination": ["No place found for \"qqzzxxjjvv\"."]}` |
| 400 | No truck route | `{"non_field_errors": ["No truck route found between these places."]}` |
| 404 | Plan expired | `{"detail": "Plan expired, please create a new plan"}` |
| 429 | Too many requests | `{"detail": "..."}` |
| 502 | HERE or Open-Meteo failed | `{"detail": "HERE Geocoding returned HTTP 401: apiKey invalid. apiKey not found."}` |

### Decisions & assumptions

**Risk**

- **Boundary inclusivity.** Lower bounds are inclusive, so 25 mph is Moderate and 0.25 in/hr of rain is High. The No Travel limits for rain and snow are exclusive: exactly 1.00 in/hr of rain or 3.0 in/hr of snow is Severe. Exactly 55 mph is No Travel. Bands are continuous, so 34.9 mph is Moderate.

  | | Low | Moderate | High | Severe | No Travel |
  | --- | --- | --- | --- | --- | --- |
  | Wind (mph) | < 25 | 25 | 35 | 45 | ≥ 55 |
  | Rain (in/hr) | < 0.10 | 0.10 | 0.25 | 0.50 | > 1.00 |
  | Snow (in/hr) | < 0.5 | 0.5 | 1.0 | 2.0 | > 3.0 |

- **Load rules** raise the wind level only. 45 to under 55 mph with more than 30,000 lb is No Travel. 35 to under 45 mph with more than 40,000 lb is Severe. The load limits are exclusive.
- **Sustained wind, not gusts.** Gusts are shown but never change the risk.
- **Rain + showers.** Open-Meteo reports convective showers separately from rain. Both are liquid, so they are added together.
- **Preceding-hour precipitation.** Rain and snow are totals for the hour before each timestamp, so a checkpoint uses the first hour mark at or after its ETA. Wind is instantaneous, so it uses the nearest hour.

**Routes and ranking**

- **No Travel ranking.** No Travel isn't in the brief's ranking, so it's treated as worse than Severe. The order is fewest No Travel, Severe, then High miles, then lowest average risk, then shortest duration. Miles are compared to 0.1 and average risk to 3 decimals.
- **Unknown miles** (no forecast) count toward no risk level, so a route with missing forecasts can rank above one with known risk. `unknown_miles` shows how much is missing.
- **Tare weight.** HERE is given the load plus 35,000 lb for the empty truck (`TRUCK_TARE_LB`). An 80,000 lb load is accepted, though the gross weight then exceeds the usual US limit.
- **ETAs** use the duration HERE gives for each stretch of road. They include no rest stops or driving-hour limits.
- **Duplicate routes.** Two routes are the same if 90% of their points, rounded to 0.01°, overlap. With fewer than three routes, HERE is asked again for shortest and then toll-free routes.
- **Route labels.** `via` lists the two route numbers covering the most distance. Two numbers can share one road, such as I-70 and US-40.
- **Restriction notices** from HERE aren't read, so a route that HERE flags for a truck restriction isn't marked.

**Forecasts**

- **0.1° weather snapping.** Checkpoints use the forecast of the nearest 0.1° grid cell, so nearby ones share a request. The models resolve only 3 to 13 km anyway. Forecasts are cached for 30 minutes per cell and time window.
- **Heatmap grid.** Covers 25 miles around each route with the finest grid (0.1° to 1.0°) that stays within 400 cells. Every grid is a multiple of 0.1°.
- **Forecast horizon.** Each plan fetches at least 48 hours, or the longest trip plus 1 hour. Departures are limited to 7 days ahead. Open-Meteo forecasts reach about 15 days, so long trips still fit.
- **Open-Meteo rate limits.** Its free tier is rate limited, and one heatmap can request up to 400 locations. Going over returns a 502 with Open-Meteo's reason.
