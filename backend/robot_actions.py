import asyncio

class RobotActions:
    def __init__(self, state):
        self.state = state

    async def check_vitals(self):
        # Placeholder: simulate checking vitals
        await asyncio.sleep(1)
        print("Checking vitals...")

    async def call_nurse(self):
        # Placeholder
        await asyncio.sleep(1)
        print("Calling nurse...")

    async def navigate(self, destination):
        # Placeholder
        await asyncio.sleep(1)
        print(f"Navigating to {destination}...")

    async def stop(self):
        # Placeholder
        await asyncio.sleep(1)
        print("Stopping robot...")