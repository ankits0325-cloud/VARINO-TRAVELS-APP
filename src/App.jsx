import { useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import './App.css'

const STORAGE_KEY = 'varino-travel-quotations'
const DEFAULT_LOGO_URL =
  'https://github.com/user-attachments/assets/60e9cafa-1bca-423d-82cc-758bf54f822a'

const PRESET_ADDONS = {
  'Nathula Pass': 5500,
  'Zero Point': 4200,
  'Toy Train': 2800,
}

const DEFAULT_INCLUDES = `Hotel stay as per itinerary\nDaily breakfast and dinner\nPrivate transport for sightseeing and transfers\nDriver allowance, fuel, parking and toll taxes`

const DEFAULT_EXCLUDES = `Airfare/train fare\nPersonal expenses and tips\nEntry tickets and activities not mentioned\nTravel insurance and medical expenses`

const DEFAULT_TERMS = `Rates are subject to hotel and transport availability at the time of confirmation.\nAny increase in taxes or entry charges will be charged extra.\nThis quotation is valid for 7 days from issue date.`

const DEFAULT_BOOKING = `50% advance required to confirm booking.\nBalance payment to be completed 7 days before departure.`

const DEFAULT_CANCELLATION = `30+ days before travel: 10% deduction\n15-29 days before travel: 30% deduction\n0-14 days before travel: 100% deduction`

const todayISO = () => new Date().toISOString().slice(0, 10)

const createFileNumber = () => {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `VT-${stamp}`
}

const defaultForm = () => ({
  id: null,
  fileNumber: createFileNumber(),
  issueDate: todayISO(),
  clientName: '',
  phone: '',
  travelDate: '',
  destination: '',
  duration: '7 Days / 6 Nights',
  adults: 2,
  children: 0,
  hotelCost: 0,
  transportCost: 0,
  marginType: 'fixed',
  marginValue: 0,
  addOnChecks: {
    'Nathula Pass': false,
    'Zero Point': false,
    'Toy Train': false,
  },
  manualAddOns: [{ name: '', cost: 0 }],
  itinerary: '',
  transportPlan: '',
  includes: DEFAULT_INCLUDES,
  excludes: DEFAULT_EXCLUDES,
  terms: DEFAULT_TERMS,
  specialNotes: '',
  bankDetails:
    'Account Name: Varino Travels\nBank Name: __________________\nA/C No: __________________\nIFSC: __________________',
  bookingPolicy: DEFAULT_BOOKING,
  cancellationPolicy: DEFAULT_CANCELLATION,
  logoUrl: DEFAULT_LOGO_URL,
})

const readSaved = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const money = (value) => Number(value || 0)

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatINR = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(toNumber(value))

const inferDayCount = (duration) => {
  const match = duration.match(/\d+/)
  return match ? Math.max(1, Number(match[0])) : 5
}

const createFallbackLogo = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 500
  canvas.height = 150
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const gradient = ctx.createLinearGradient(0, 0, 220, 120)
  gradient.addColorStop(0, '#fff3b0')
  gradient.addColorStop(0.5, '#f5c542')
  gradient.addColorStop(1, '#c68a00')

  ctx.fillStyle = '#0b0b0b'
  ctx.fillRect(0, 0, 500, 150)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(46, 22)
  ctx.lineTo(94, 22)
  ctx.lineTo(122, 126)
  ctx.lineTo(18, 126)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#0b0b0b'
  ctx.font = 'bold 56px Arial'
  ctx.fillText('V', 36, 96)

  ctx.fillStyle = '#f5c542'
  ctx.font = '700 38px Arial'
  ctx.fillText('Varino Travels', 148, 90)

  return canvas.toDataURL('image/png')
}

const fetchImageAsDataUrl = async (url) => {
  if (!url) return ''
  const response = await fetch(url)
  if (!response.ok) throw new Error('Logo download failed')
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const buildTransportRows = (transportPlan) => {
  const lines = transportPlan
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line, index) => {
    const [dayPart, rest = ''] = line.split(':')
    const [route = rest || line, vehicle = 'SUV'] = rest.split('|')
    const day = dayPart.toLowerCase().includes('day') ? dayPart : `Day ${index + 1}`
    return [day.trim(), route.trim(), vehicle.trim() || 'SUV']
  })
}

const buildItineraryRows = (itinerary) => {
  const rows = []
  let currentDay = 'Overview'
  let currentText = ''

  itinerary
    .split('\n')
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) return
      if (/^day\s*\d+/i.test(line)) {
        if (currentText) rows.push([currentDay, currentText.trim()])
        const [day, ...rest] = line.split(':')
        currentDay = day
        currentText = rest.join(':').trim()
      } else {
        currentText += `${currentText ? ' ' : ''}${line}`
      }
    })

  if (currentText) rows.push([currentDay, currentText.trim()])
  if (!rows.length) rows.push(['Overview', itinerary || 'No itinerary provided'])
  return rows
}

function App() {
  const [form, setForm] = useState(defaultForm)
  const [savedQuotes, setSavedQuotes] = useState(readSaved)
  const [claudeMode, setClaudeMode] = useState('proxy')
  const [claudeProxyUrl, setClaudeProxyUrl] = useState(import.meta.env.VITE_CLAUDE_PROXY_URL || '')
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [loadingItinerary, setLoadingItinerary] = useState(false)
  const [status, setStatus] = useState('Ready')

  const selectedAddOns = useMemo(() => {
    const preset = Object.entries(form.addOnChecks)
      .filter(([, checked]) => checked)
      .map(([name]) => ({ name, cost: PRESET_ADDONS[name] || 0 }))

    const manual = form.manualAddOns
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name.trim(), cost: toNumber(item.cost) }))

    return [...preset, ...manual]
  }, [form.addOnChecks, form.manualAddOns])

  const subtotal = useMemo(
    () =>
      money(form.hotelCost) +
      money(form.transportCost) +
      selectedAddOns.reduce((sum, item) => sum + money(item.cost), 0),
    [form.hotelCost, form.transportCost, selectedAddOns],
  )

  const marginAmount = useMemo(() => {
    if (form.marginType === 'percentage') {
      return (subtotal * money(form.marginValue)) / 100
    }
    return money(form.marginValue)
  }, [form.marginType, form.marginValue, subtotal])

  const finalPrice = subtotal + marginAmount

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const setNumeric = (key, value) => updateField(key, toNumber(value))

  const toggleAddon = (name) => {
    setForm((prev) => ({
      ...prev,
      addOnChecks: {
        ...prev.addOnChecks,
        [name]: !prev.addOnChecks[name],
      },
    }))
  }

  const updateManualAddon = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.manualAddOns]
      next[index] = { ...next[index], [key]: key === 'cost' ? toNumber(value) : value }
      return { ...prev, manualAddOns: next }
    })
  }

  const addManualAddon = () => {
    setForm((prev) => ({ ...prev, manualAddOns: [...prev.manualAddOns, { name: '', cost: 0 }] }))
  }

  const removeManualAddon = (index) => {
    setForm((prev) => ({
      ...prev,
      manualAddOns: prev.manualAddOns.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const generateTransport = () => {
    const dayCount = inferDayCount(form.duration)
    const destination = form.destination || 'destination'
    const lines = Array.from({ length: dayCount }, (_, idx) => {
      const day = idx + 1
      if (day === 1) return `Day ${day}: Arrival transfer to hotel in ${destination} | Innova`
      if (day === dayCount) return `Day ${day}: Hotel to departure point transfer | SUV`
      return `Day ${day}: Local sightseeing route in ${destination} | SUV`
    })
    updateField('transportPlan', lines.join('\n'))
    setStatus('Transport plan generated.')
  }

  const generateItinerary = async () => {
    setLoadingItinerary(true)
    setStatus('Generating itinerary with Claude...')

    const prompt = `Create a concise professional day-wise travel itinerary for quotation document.
Destination: ${form.destination || 'Not specified'}
Duration: ${form.duration}
Travel Date: ${form.travelDate || 'Not specified'}
Travelers: ${form.adults} adults, ${form.children} children
Style: short, clean, practical, agency-ready.
Output only plain text lines in format:
Day 1: ...
Day 2: ...`

    try {
      let response
      if (claudeMode === 'proxy') {
        if (!claudeProxyUrl.trim()) {
          throw new Error('Set VITE_CLAUDE_PROXY_URL or enter Proxy URL.')
        }
        response = await fetch(claudeProxyUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        })
      } else {
        if (!claudeApiKey.trim()) {
          throw new Error('Add your Claude API key for direct mode.')
        }
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeApiKey.trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 900,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
      }

      if (!response.ok) {
        throw new Error(`Claude request failed (${response.status})`)
      }

      const data = await response.json()
      const text =
        data?.text ||
        (data?.content || [])
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n')
          .trim()

      updateField('itinerary', text)
      setStatus('Itinerary generated successfully.')
    } catch (error) {
      setStatus(`Itinerary generation failed: ${error.message}`)
    } finally {
      setLoadingItinerary(false)
    }
  }

  const saveQuotation = () => {
    const id = form.id || `q-${Date.now()}`
    const payload = { ...form, id, updatedAt: new Date().toISOString() }

    const next = [...savedQuotes]
    const existingIndex = next.findIndex((item) => item.id === id)

    if (existingIndex >= 0) {
      next[existingIndex] = payload
    } else {
      next.unshift(payload)
    }

    setSavedQuotes(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setForm((prev) => ({ ...prev, id }))
    setStatus('Quotation saved locally.')
  }

  const loadQuotation = (quote) => {
    setForm(quote)
    setStatus(`Loaded quotation ${quote.fileNumber}.`)
  }

  const deleteQuotation = (id) => {
    const next = savedQuotes.filter((item) => item.id !== id)
    setSavedQuotes(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setStatus('Saved quotation deleted.')
  }

  const resetForm = () => {
    setForm(defaultForm())
    setStatus('Started a new quotation.')
  }

  const createCopyText = () => {
    const addOnText = selectedAddOns.length
      ? selectedAddOns.map((item) => `${item.name}: ${formatINR(item.cost)}`).join('\n')
      : 'None'

    return `Varino Travels - Quotation ${form.fileNumber}
Issue Date: ${form.issueDate}

Client: ${form.clientName || '-'}
Phone: ${form.phone || '-'}
Travel Date: ${form.travelDate || '-'}
Destination: ${form.destination || '-'}
Duration: ${form.duration}
Travelers: ${form.adults} Adults, ${form.children} Children

Pricing:
Hotel Cost: ${formatINR(form.hotelCost)}
Transport Cost: ${formatINR(form.transportCost)}
Add-ons:\n${addOnText}
Subtotal: ${formatINR(subtotal)}
Margin (${form.marginType === 'percentage' ? `${form.marginValue}%` : 'Fixed'}): ${formatINR(marginAmount)}
Final Price: ${formatINR(finalPrice)}

Itinerary:\n${form.itinerary || '-'}

Transport:\n${form.transportPlan || '-'}

Includes:\n${form.includes}

Excludes:\n${form.excludes}

Terms & Conditions:\n${form.terms}

Special Notes:\n${form.specialNotes || '-'}

Bank Details:\n${form.bankDetails}

Booking Policy:\n${form.bookingPolicy}

Cancellation Policy:\n${form.cancellationPolicy}`
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(createCopyText())
      setStatus('Quotation text copied.')
    } catch {
      setStatus('Failed to copy text.')
    }
  }

  const generatePdf = async () => {
    setStatus('Generating PDF...')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    let logoDataUrl = ''
    try {
      logoDataUrl = await fetchImageAsDataUrl(form.logoUrl)
    } catch {
      logoDataUrl = ''
    }
    if (!logoDataUrl) logoDataUrl = createFallbackLogo()

    if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 14, 10, 26, 20)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('Varino Travels', 45, 18)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`File No: ${form.fileNumber}`, 150, 13)
    doc.text(`Issue Date: ${form.issueDate || '-'}`, 150, 18)

    autoTable(doc, {
      startY: 34,
      theme: 'grid',
      head: [['Client Details', 'Trip Details']],
      body: [[
        `Name: ${form.clientName || '-'}\nPhone: ${form.phone || '-'}\nTravel Date: ${form.travelDate || '-'}`,
        `Destination: ${form.destination || '-'}\nDuration: ${form.duration}\nTravelers: ${form.adults} Adults / ${form.children} Children`,
      ]],
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [25, 55, 109] },
    })

    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFillColor(232, 244, 255)
    doc.rect(14, finalY, 182, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Final Price: ${formatINR(finalPrice)}`, 18, finalY + 9)

    autoTable(doc, {
      startY: finalY + 20,
      theme: 'striped',
      head: [['Day-wise Itinerary', 'Description']],
      body: buildItineraryRows(form.itinerary),
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [46, 82, 143] },
      columnStyles: { 0: { cellWidth: 32 } },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      theme: 'grid',
      head: [['Transport Day', 'Route', 'Vehicle']],
      body: buildTransportRows(form.transportPlan),
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [46, 82, 143] },
      columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 30 } },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      theme: 'grid',
      head: [['Add-on', 'Cost']],
      body: selectedAddOns.length
        ? selectedAddOns.map((item) => [item.name, formatINR(item.cost)])
        : [['No add-ons selected', formatINR(0)]],
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [46, 82, 143] },
      columnStyles: { 1: { halign: 'right' } },
    })

    let y = doc.lastAutoTable.finalY + 8
    const pageHeight = doc.internal.pageSize.height

    const addTextSection = (title, text) => {
      const content = text || '-'
      const wrapped = doc.splitTextToSize(content, 180)
      const required = 8 + wrapped.length * 5
      if (y + required > pageHeight - 12) {
        doc.addPage()
        y = 14
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(title, 14, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(wrapped, 14, y)
      y += wrapped.length * 5 + 3
    }

    addTextSection('Cost Includes', form.includes)
    addTextSection('Cost Excludes', form.excludes)
    addTextSection('Terms & Conditions', form.terms)
    addTextSection('Special Notes', form.specialNotes)
    addTextSection('Bank Details', form.bankDetails)
    addTextSection('Booking Policy', form.bookingPolicy)
    addTextSection('Cancellation Policy', form.cancellationPolicy)

    doc.save(`${form.fileNumber}.pdf`)
    setStatus('PDF downloaded.')
  }

  return (
    <main className="app">
      <header className="header card">
        <div>
          <h1>Varino Travels Quotation Builder</h1>
          <p>Create professional itinerary quotations in under 2 minutes.</p>
        </div>
        <div className="actions">
          <button onClick={resetForm}>New</button>
          <button onClick={saveQuotation}>Save</button>
          <button onClick={copyText}>Copy Text</button>
          <button className="primary" onClick={generatePdf}>
            Download PDF
          </button>
        </div>
      </header>

      <p className="status">{status}</p>

      <section className="layout">
        <aside className="card saved">
          <h2>Saved Quotations</h2>
          {!savedQuotes.length ? (
            <p className="muted">No saved quotations yet.</p>
          ) : (
            <ul>
              {savedQuotes.map((quote) => (
                <li key={quote.id}>
                  <button onClick={() => loadQuotation(quote)}>
                    <strong>{quote.fileNumber}</strong>
                    <span>{quote.clientName || 'Unnamed Client'}</span>
                    <span>{quote.destination || 'No destination'}</span>
                  </button>
                  <button className="danger" onClick={() => deleteQuotation(quote.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="content">
          <section className="card grid cols-3">
            <h2>Client & Trip Details</h2>
            <label>
              Client Name
              <input value={form.clientName} onChange={(e) => updateField('clientName', e.target.value)} />
            </label>
            <label>
              Phone (optional)
              <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </label>
            <label>
              Travel Date
              <input type="date" value={form.travelDate} onChange={(e) => updateField('travelDate', e.target.value)} />
            </label>
            <label>
              Destination
              <input value={form.destination} onChange={(e) => updateField('destination', e.target.value)} />
            </label>
            <label>
              Duration
              <input value={form.duration} onChange={(e) => updateField('duration', e.target.value)} />
            </label>
            <div className="inline-inputs">
              <label>
                Adults
                <input
                  type="number"
                  min="0"
                  value={form.adults}
                  onChange={(e) => setNumeric('adults', e.target.value)}
                />
              </label>
              <label>
                Children
                <input
                  type="number"
                  min="0"
                  value={form.children}
                  onChange={(e) => setNumeric('children', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="card grid cols-3">
            <h2>Pricing & Add-ons</h2>
            <label>
              Hotel Cost
              <input
                type="number"
                min="0"
                value={form.hotelCost}
                onChange={(e) => setNumeric('hotelCost', e.target.value)}
              />
            </label>
            <label>
              Transport Cost
              <input
                type="number"
                min="0"
                value={form.transportCost}
                onChange={(e) => setNumeric('transportCost', e.target.value)}
              />
            </label>
            <div className="inline-inputs">
              <label>
                Margin Type
                <select
                  value={form.marginType}
                  onChange={(e) => updateField('marginType', e.target.value)}
                >
                  <option value="fixed">Fixed</option>
                  <option value="percentage">Percentage</option>
                </select>
              </label>
              <label>
                Margin Value
                <input
                  type="number"
                  min="0"
                  value={form.marginValue}
                  onChange={(e) => setNumeric('marginValue', e.target.value)}
                />
              </label>
            </div>

            <div className="addon-box">
              <p>Preset Add-ons</p>
              {Object.entries(PRESET_ADDONS).map(([name, cost]) => (
                <label key={name} className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.addOnChecks[name]}
                    onChange={() => toggleAddon(name)}
                  />
                  {name} ({formatINR(cost)})
                </label>
              ))}
            </div>

            <div className="addon-box">
              <p>Manual Add-ons</p>
              {form.manualAddOns.map((item, index) => (
                <div className="manual-addon" key={`manual-${index}`}>
                  <input
                    placeholder="Add-on name"
                    value={item.name}
                    onChange={(e) => updateManualAddon(index, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Cost"
                    value={item.cost}
                    onChange={(e) => updateManualAddon(index, 'cost', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeManualAddon(index)}
                    disabled={form.manualAddOns.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={addManualAddon}>
                + Add manual add-on
              </button>
            </div>

            <div className="pricing-summary">
              <h3>Pricing Breakdown</h3>
              <p>Subtotal: {formatINR(subtotal)}</p>
              <p>Margin: {formatINR(marginAmount)}</p>
              <p className="final">Final Price: {formatINR(finalPrice)}</p>
            </div>
          </section>

          <section className="card grid">
            <h2>AI Itinerary Generator (Claude)</h2>
            <div className="ai-row">
              <select value={claudeMode} onChange={(e) => setClaudeMode(e.target.value)}>
                <option value="proxy">Proxy Mode (Recommended)</option>
                <option value="direct">Direct Browser Mode</option>
              </select>
              {claudeMode === 'proxy' ? (
                <input
                  placeholder="Proxy URL (e.g. /api/claude-itinerary)"
                  value={claudeProxyUrl}
                  onChange={(e) => setClaudeProxyUrl(e.target.value)}
                />
              ) : (
                <input
                  type="password"
                  placeholder="Claude API Key (insecure in browser)"
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                />
              )}
              <button onClick={generateItinerary} disabled={loadingItinerary}>
                {loadingItinerary ? 'Generating...' : 'Generate Itinerary'}
              </button>
            </div>
            <textarea
              rows={8}
              value={form.itinerary}
              onChange={(e) => updateField('itinerary', e.target.value)}
              placeholder="Day 1: Arrival and check-in..."
            />
          </section>

          <section className="card grid">
            <h2>Transport Plan</h2>
            <div className="ai-row">
              <button onClick={generateTransport}>Auto Generate Transport</button>
            </div>
            <textarea
              rows={6}
              value={form.transportPlan}
              onChange={(e) => updateField('transportPlan', e.target.value)}
              placeholder="Day 1: Airport to hotel | Innova"
            />
          </section>

          <section className="card grid cols-2">
            <h2>Quotation Content</h2>
            <label>
              Cost Includes
              <textarea rows={5} value={form.includes} onChange={(e) => updateField('includes', e.target.value)} />
            </label>
            <label>
              Cost Excludes
              <textarea rows={5} value={form.excludes} onChange={(e) => updateField('excludes', e.target.value)} />
            </label>
            <label>
              Terms & Conditions
              <textarea rows={5} value={form.terms} onChange={(e) => updateField('terms', e.target.value)} />
            </label>
            <label>
              Special Notes
              <textarea
                rows={5}
                value={form.specialNotes}
                onChange={(e) => updateField('specialNotes', e.target.value)}
              />
            </label>
            <label>
              Bank Details
              <textarea
                rows={5}
                value={form.bankDetails}
                onChange={(e) => updateField('bankDetails', e.target.value)}
              />
            </label>
            <label>
              Logo URL (optional)
              <input value={form.logoUrl} onChange={(e) => updateField('logoUrl', e.target.value)} />
            </label>
            <label>
              Booking Policy
              <textarea
                rows={4}
                value={form.bookingPolicy}
                onChange={(e) => updateField('bookingPolicy', e.target.value)}
              />
            </label>
            <label>
              Cancellation Policy
              <textarea
                rows={4}
                value={form.cancellationPolicy}
                onChange={(e) => updateField('cancellationPolicy', e.target.value)}
              />
            </label>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
