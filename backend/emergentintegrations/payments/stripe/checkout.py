import stripe
from pydantic import BaseModel
from typing import Dict, Any

class CheckoutSessionRequest(BaseModel):
    amount: float
    currency: str
    success_url: str
    cancel_url: str
    metadata: Dict[str, Any]

class StripeCheckoutSessionResponse:
    def __init__(self, session_id: str, url: str):
        self.session_id = session_id
        self.url = url

class StripeCheckoutStatusResponse:
    def __init__(self, payment_status: str, status: str, amount_total: float, currency: str):
        self.payment_status = payment_status
        self.status = status
        self.amount_total = amount_total
        self.currency = currency

class StripeWebhookEventResponse:
    def __init__(self, session_id: str, payment_status: str):
        self.session_id = session_id
        self.payment_status = payment_status

class StripeCheckout:
    def __init__(self, api_key: str, webhook_url: str):
        self.api_key = api_key
        stripe.api_key = api_key
        self.webhook_url = webhook_url

    async def create_checkout_session(self, request: CheckoutSessionRequest) -> StripeCheckoutSessionResponse:
        if not self.api_key:
            mock_id = "mock_session_key"
            return StripeCheckoutSessionResponse(session_id=mock_id, url=request.success_url.replace("{CHECKOUT_SESSION_ID}", mock_id))
        
        import asyncio
        loop = asyncio.get_running_loop()
        def create():
            return stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': request.currency,
                        'product_data': {
                            'name': 'STRATELIQ Plan',
                        },
                        'unit_amount': int(request.amount * 100),
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=request.success_url,
                cancel_url=request.cancel_url,
                metadata=request.metadata,
            )
        session = await loop.run_in_executor(None, create)
        return StripeCheckoutSessionResponse(session_id=session.id, url=session.url)

    async def get_checkout_status(self, session_id: str) -> StripeCheckoutStatusResponse:
        if session_id.startswith("mock_session"):
            return StripeCheckoutStatusResponse(
                payment_status="paid",
                status="complete",
                amount_total=29.99,
                currency="usd"
            )
        
        import asyncio
        loop = asyncio.get_running_loop()
        def retrieve():
            return stripe.checkout.Session.retrieve(session_id)
        session = await loop.run_in_executor(None, retrieve)
        return StripeCheckoutStatusResponse(
            payment_status=session.payment_status,
            status=session.status,
            amount_total=session.amount_total / 100.0 if session.amount_total else 0.0,
            currency=session.currency
        )

    async def handle_webhook(self, body: bytes, sig: str) -> StripeWebhookEventResponse:
        if not self.api_key:
            return StripeWebhookEventResponse(session_id="mock_session", payment_status="paid")
        
        import json
        event_data = json.loads(body.decode('utf-8'))
        session_id = event_data.get("data", {}).get("object", {}).get("id", "")
        payment_status = event_data.get("data", {}).get("object", {}).get("payment_status", "")
        return StripeWebhookEventResponse(session_id=session_id, payment_status=payment_status)
