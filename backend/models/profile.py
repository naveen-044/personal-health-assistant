from pydantic import BaseModel, Field
from typing import Optional


class ProfileModel(BaseModel):
    user_id: str
    name: Optional[str] = ''
    age_range: Optional[str] = ''
    allergies: Optional[str] = ''
    conditions: Optional[str] = ''
    medications: Optional[str] = ''
    preferences: Optional[str] = ''


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(default='')
    age_range: Optional[str] = Field(default='')
    allergies: Optional[str] = Field(default='')
    conditions: Optional[str] = Field(default='')
    medications: Optional[str] = Field(default='')
    preferences: Optional[str] = Field(default='')
