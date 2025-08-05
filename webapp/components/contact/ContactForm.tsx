'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2 } from 'lucide-react'

export function ContactForm() {
  const t = useTranslations('contact')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // 이메일 전송 로직
    // 실제로는 API 엔드포인트를 호출하거나 이메일 서비스를 사용해야 합니다
    const mailtoLink = `mailto:contact@shizue.ai?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(
      `Name: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`
    )}`
    
    window.location.href = mailtoLink
    
    // 폼 리셋
    setTimeout(() => {
      setIsSubmitting(false)
      setFormData({ name: '', email: '', subject: '', message: '' })
    }, 1000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">{t('form.name')}</Label>
          <Input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder={t('form.namePlaceholder')}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="email">{t('form.email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder={t('form.emailPlaceholder')}
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="subject">{t('form.subject')}</Label>
        <Input
          id="subject"
          name="subject"
          type="text"
          value={formData.subject}
          onChange={handleChange}
          required
          placeholder={t('form.subjectPlaceholder')}
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="message">{t('form.message')}</Label>
        <Textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          placeholder={t('form.messagePlaceholder')}
          rows={8}
          className="resize-none"
        />
      </div>
      
      <Button 
        type="submit" 
        size="lg" 
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('form.sending')}
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            {t('form.send')}
          </>
        )}
      </Button>
    </form>
  )
}