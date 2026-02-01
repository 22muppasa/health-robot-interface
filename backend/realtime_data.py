"""
Real-time data fetcher for weather, time, news, and other information.
Integrates with public APIs for current information delivery.
"""

from typing import Dict, Optional, Any
from datetime import datetime
import os
import aiohttp
import asyncio

class RealTimeDataFetcher:
    """Fetches real-time information from various APIs."""
    
    def __init__(self):
        """Initialize data fetcher."""
        self.weather_api_key = os.getenv("WEATHER_API_KEY", "")  # OpenWeatherMap
        self.news_api_key = os.getenv("NEWS_API_KEY", "")  # NewsAPI
        self.location = os.getenv("LOCATION", "New York")
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def start(self):
        """Start async session."""
        if not self._session:
            self._session = aiohttp.ClientSession()
    
    async def stop(self):
        """Stop async session."""
        if self._session:
            await self._session.close()
            self._session = None
    
    def get_current_time(self) -> Dict[str, Any]:
        """Get current time information."""
        now = datetime.now()
        return {
            "time": now.strftime("%I:%M %p"),
            "hour": now.hour,
            "minute": now.minute,
            "second": now.second,
            "formatted": now.strftime("%I:%M %p on %A, %B %d, %Y"),
            "timestamp": now.isoformat()
        }
    
    def get_current_date(self) -> Dict[str, Any]:
        """Get current date information."""
        now = datetime.now()
        return {
            "date": now.strftime("%B %d, %Y"),
            "day": now.strftime("%A"),
            "day_number": now.day,
            "month": now.strftime("%B"),
            "month_number": now.month,
            "year": now.year,
            "timestamp": now.isoformat()
        }
    
    async def get_weather(self, location: Optional[str] = None) -> Dict[str, Any]:
        """
        Get current weather information.
        
        Uses OpenWeatherMap API if key is available.
        Accepts optional location parameter - if not provided, uses default location.
        """
        # Use provided location or fall back to default
        loc = location if location and location.strip() else self.location
        
        if not self.weather_api_key:
            return {
                "status": "unavailable",
                "message": "Weather API key not configured. Set WEATHER_API_KEY in .env",
                "location": loc
            }
        
        if not self._session:
            return {
                "status": "unavailable",
                "message": "Weather API session not initialized",
                "location": loc
            }
        
        try:
            # Build API URL with location
            url = (
                f"https://api.openweathermap.org/data/2.5/weather"
                f"?q={loc}&appid={self.weather_api_key}&units=metric"
            )
            
            print(f"Fetching weather for: {loc}")
            print(f"API URL: {url}")
            
            async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"Weather API response successful for {loc}")
                    return {
                        "status": "success",
                        "location": data.get("name", loc),
                        "temperature": data["main"]["temp"],
                        "feels_like": data["main"]["feels_like"],
                        "humidity": data["main"]["humidity"],
                        "pressure": data["main"]["pressure"],
                        "description": data["weather"][0]["description"],
                        "wind_speed": data.get("wind", {}).get("speed", 0),
                        "cloudiness": data.get("clouds", {}).get("all", 0),
                        "timestamp": datetime.now().isoformat()
                    }
                elif resp.status == 404:
                    return {
                        "status": "error",
                        "message": f"Location '{loc}' not found. Please check the spelling and try again.",
                        "location": loc
                    }
                else:
                    error_text = await resp.text()
                    return {
                        "status": "error",
                        "message": f"Weather API error (status {resp.status}): {error_text}",
                        "location": loc
                    }
        
        except asyncio.TimeoutError:
            return {
                "status": "error",
                "message": "Weather API request timed out",
                "location": loc
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
                "location": loc
            }
    
    async def get_news(self, category: str = "health") -> Dict[str, Any]:
        """
        Get latest news headlines.
        
        Uses NewsAPI if key is available.
        """
        if not self.news_api_key or not self._session:
            return {
                "status": "unavailable",
                "message": "News API not configured",
                "category": category
            }
        
        try:
            url = (
                f"https://newsapi.org/v2/top-headlines"
                f"?category={category}&sortBy=publishedAt&apiKey={self.news_api_key}"
            )
            
            async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    articles = []
                    
                    # Get top 3 articles
                    for article in data.get("articles", [])[:3]:
                        articles.append({
                            "title": article.get("title"),
                            "description": article.get("description"),
                            "source": article.get("source", {}).get("name"),
                            "url": article.get("url"),
                            "published_at": article.get("publishedAt")
                        })
                    
                    return {
                        "status": "success",
                        "category": category,
                        "articles": articles,
                        "total_results": data.get("totalResults", 0),
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    return {
                        "status": "error",
                        "message": f"News API returned status {resp.status}",
                        "category": category
                    }
        
        except asyncio.TimeoutError:
            return {
                "status": "error",
                "message": "News API request timed out",
                "category": category
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
                "category": category
            }
    
    def get_health_tips(self) -> Dict[str, Any]:
        """Get health tips and information."""
        tips = [
            "Drink plenty of water throughout the day",
            "Take regular breaks and stretch every hour",
            "Practice deep breathing exercises to reduce stress",
            "Maintain a consistent sleep schedule",
            "Eat balanced meals with vegetables and fruits",
            "Stay active with light exercise or walks",
            "Keep track of your vital signs regularly",
            "Stay connected with family and friends",
            "Limit processed foods and sugar intake",
            "Take your medications as prescribed"
        ]
        
        import random
        return {
            "status": "success",
            "tip": random.choice(tips),
            "timestamp": datetime.now().isoformat()
        }
    
    async def get_detailed_info(self, query: str) -> Dict[str, Any]:
        """
        Get detailed information for any query.
        Can be extended to use Wikipedia API or other sources.
        """
        # This is a placeholder that can be extended
        # For now, return a simple response
        return {
            "status": "success",
            "query": query,
            "message": f"Information about '{query}' (extended search not yet configured)",
            "timestamp": datetime.now().isoformat()
        }

# Global instance
data_fetcher = RealTimeDataFetcher()
