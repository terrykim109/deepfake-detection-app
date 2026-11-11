/* Account rules shared by Create Account and Profile. The username rule and
   messages match backend/usernames.py, which has the final say. */

export const MIN_PASSWORD_LENGTH = 12
export const PASSWORD_REQUIREMENTS_MESSAGE =
  `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include an uppercase letter, ` +
  'a lowercase letter, a number, and a special character.'

export function meetsPasswordPolicy(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

export const CURRENT_PASSWORD_WRONG = 'Current password is incorrect.'

// Case-sensitive: "Alex" and "alex" are different usernames
export const USERNAME_RULE = 'Usernames are 3 to 20 characters: letters, numbers, _ and .'
export const USERNAME_TAKEN = 'That username is taken. Try another one.'

export function isValidUsername(name: string): boolean {
  return /^[A-Za-z0-9_.]{3,20}$/.test(name)
}
