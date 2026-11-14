from pydantic import BaseModel, Field
from typing import Optional


class ProfilePayload(BaseModel):
    name: Optional[str] = Field(default='')
    age_range: Optional[str] = Field(default='')
    allergies: Optional[str] = Field(default='')
    conditions: Optional[str] = Field(default='')
    medications: Optional[str] = Field(default='')
    preferences: Optional[str] = Field(default='')
