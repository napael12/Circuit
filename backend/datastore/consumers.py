import asyncio
import json

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from . import activity
from .models import Datastore


class DatastoreConsumer(AsyncWebsocketConsumer):
    """Streams pushed updates for one scheduled Datastore to the client.

    Replaces the legacy panel's client-side polling timer: components for
    a scheduled datastore open one of these instead of re-fetching on an
    interval, and receive a message whenever the scheduler refreshes the
    underlying query/action (see datastore.services.refresh_scheduled).

    Every message carries ``last_run_at`` alongside ``data`` so the client
    can show "last loaded" for the scheduled indicator (specs/
    datasource_enhancements.md) without a separate poll.

    Also drives the idle_timeout_seconds behavior (see datastore.activity):
    connect/disconnect mark this datastore active/inactive so
    refresh_scheduled knows whether anyone's watching, and a connect that
    ends an idle period (nobody watching, or this is the very first ever
    subscriber) triggers an immediate refresh rather than waiting for the
    next cron tick.
    """

    async def connect(self):
        self.ds_id = self.scope['url_route']['kwargs']['ds_id']
        self.group_name = f'datastore_{self.ds_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        woke = activity.connect(self.ds_id)

        cached = await self._cached_result()
        if cached is not None:
            result, last_run_at = cached
            await self.send(text_data=json.dumps({
                'data': result,
                'last_run_at': last_run_at.isoformat() if last_run_at else None,
            }))

        if woke:
            asyncio.create_task(self._refresh_now())

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        activity.disconnect(self.ds_id)

    async def datastore_update(self, event):
        await self.send(text_data=json.dumps({'data': event['data'], 'last_run_at': event.get('last_run_at')}))

    @database_sync_to_async
    def _cached_result(self):
        try:
            ds = Datastore.objects.get(pk=self.ds_id)
        except Datastore.DoesNotExist:
            return None
        if ds.last_result is None:
            return None
        return ds.last_result, ds.last_run_at

    @database_sync_to_async
    def _refresh_now(self):
        from .services import refresh_scheduled

        # Only scheduled datastores have a "source" worth re-running on
        # connect. A push-mode (or plain on-demand) datastore's socket is
        # opened for the same "am I being watched" bookkeeping (see
        # datastore.activity / the public push API), but its data only ever
        # changes via an explicit push call or its own on-demand fetch --
        # never by re-running here.
        ds = Datastore.objects.filter(pk=self.ds_id, refresh_mode=Datastore.REFRESH_SCHEDULED).first()
        if ds is not None:
            refresh_scheduled(self.ds_id)
