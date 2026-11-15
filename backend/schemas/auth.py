from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone_number: str | None = Field(default=None, max_length=32)
    password: str = Field(min_length=8, max_length=72)
    confirm_password: str = Field(min_length=8, max_length=72)
    accept_terms: bool

    @field_validator('full_name')
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        value = ' '.join(value.split())
        if not value:
            raise ValueError('Full name is required.')
        return value

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator('phone_number')
    @classmethod
    def normalize_phone_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if value and not all(character.isdigit() or character in '+(). -' for character in value):
            raise ValueError('Enter a valid phone number.')
        return value or None

    @field_validator('password', 'confirm_password')
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password must be no more than 72 bytes.')
        return value

    @model_validator(mode='after')
    def validate_registration(self) -> 'RegisterRequest':
        if self.password != self.confirm_password:
            raise ValueError('Passwords do not match.')
        if not self.accept_terms:
            raise ValueError('You must accept the Terms and Conditions.')
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)
    remember_me: bool = False

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator('password')
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Invalid email or password.')
        return value
