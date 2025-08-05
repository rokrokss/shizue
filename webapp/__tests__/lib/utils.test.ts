import { cn } from '@/lib/utils'

describe('cn utility function', () => {
  it('combines class names', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('handles conditional classes', () => {
    const result = cn('base', {
      'active': true,
      'disabled': false
    })
    expect(result).toBe('base active')
  })

  it('handles arrays of classes', () => {
    const result = cn(['class1', 'class2'], 'class3')
    expect(result).toBe('class1 class2 class3')
  })

  it('removes duplicate classes', () => {
    const result = cn('text-red-500', 'text-blue-500')
    expect(result).toBe('text-blue-500')
  })

  it('handles undefined and null values', () => {
    const result = cn('class1', undefined, null, 'class2')
    expect(result).toBe('class1 class2')
  })

  it('handles empty strings', () => {
    const result = cn('class1', '', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('merges Tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toBe('py-1 px-4')
  })

  it('handles complex Tailwind modifiers', () => {
    const result = cn(
      'hover:bg-red-500 focus:bg-blue-500',
      'hover:bg-green-500'
    )
    expect(result).toBe('focus:bg-blue-500 hover:bg-green-500')
  })

  it('preserves non-conflicting classes', () => {
    const result = cn(
      'bg-red-500 text-white p-4',
      'bg-blue-500 border rounded'
    )
    expect(result).toBe('text-white p-4 bg-blue-500 border rounded')
  })

  it('handles responsive classes', () => {
    const result = cn(
      'text-sm md:text-base',
      'md:text-lg lg:text-xl'
    )
    expect(result).toBe('text-sm md:text-lg lg:text-xl')
  })
})