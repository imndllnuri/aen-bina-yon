import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useForm } from 'react-hook-form'
import { ChargeFields, type DetailsShape } from './ChargeFields'

const types = [{ id: 't1', code: 'aidat', name: 'Aidat', tenantVisibleDefault: true, defaultSplit: 'per_unit' as const }]

function Harness({ dueDay }: { dueDay?: number }) {
  const form = useForm<DetailsShape>({ defaultValues: { typeId: 't1', amount: '', period: '2026-11-01', dueDate: '2026-11-15', description: '', tenantVisible: true } })
  return <ChargeFields form={form} types={types} amountLabel="Tutar" idPrefix="x" dueDay={dueDay} />
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('ChargeFields: the due day of the company', () => {
  it('starts with the 15th when the company never saved a day', () => {
    render(<Harness />)
    expect(screen.getByLabelText(/Son ödeme tarihi/)).toHaveValue('2026-11-15')
  })

  it('follows the company\'s day when it arrives after the form opened, as long as the person did not type a date', () => {
    const { rerender } = render(<Harness dueDay={15} />)
    expect(screen.getByLabelText(/Son ödeme tarihi/)).toHaveValue('2026-11-15')
    rerender(<Harness dueDay={20} />)
    expect(screen.getByLabelText(/Son ödeme tarihi/)).toHaveValue('2026-11-20')
  })

  it('never overwrites a date the person typed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { rerender } = render(<Harness dueDay={15} />)
    const due = screen.getByLabelText(/Son ödeme tarihi/)
    await user.clear(due)
    await user.type(due, '2026-11-03')
    rerender(<Harness dueDay={20} />)
    expect(screen.getByLabelText(/Son ödeme tarihi/)).toHaveValue('2026-11-03')
  })

  it('uses the company\'s day when the period changes (a date not typed by the person)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness dueDay={5} />)
    await user.selectOptions(screen.getByLabelText(/Dönem/), '2026-12-01')
    expect(screen.getByLabelText(/Son ödeme tarihi/)).toHaveValue('2026-12-05')
  })
})
