from rest_framework import status
from rest_framework.exceptions import APIException


class UpstreamError(APIException):
    """A service we depend on failed or couldn't be reached."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "An upstream service failed."
    default_code = "upstream_error"
