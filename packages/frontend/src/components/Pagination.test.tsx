import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination.js'

describe('Pagination', () => {
  it('renders nothing when totalPages is 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPage={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when totalPages is 0', () => {
    const { container } = render(
      <Pagination page={1} totalPages={0} onPage={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows current page and total pages', () => {
    render(<Pagination page={2} totalPages={5} onPage={vi.fn()} />)
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument()
  })

  it('disables Prev button on first page', () => {
    render(<Pagination page={1} totalPages={3} onPage={vi.fn()} />)
    expect(screen.getByText('← Prev')).toBeDisabled()
  })

  it('enables Prev button when not on first page', () => {
    render(<Pagination page={2} totalPages={3} onPage={vi.fn()} />)
    expect(screen.getByText('← Prev')).not.toBeDisabled()
  })

  it('disables Next button on last page', () => {
    render(<Pagination page={3} totalPages={3} onPage={vi.fn()} />)
    expect(screen.getByText('Next →')).toBeDisabled()
  })

  it('enables Next button when not on last page', () => {
    render(<Pagination page={2} totalPages={3} onPage={vi.fn()} />)
    expect(screen.getByText('Next →')).not.toBeDisabled()
  })

  it('calls onPage with page-1 when Prev is clicked', async () => {
    const user = userEvent.setup()
    const onPage = vi.fn()
    render(<Pagination page={3} totalPages={5} onPage={onPage} />)
    await user.click(screen.getByText('← Prev'))
    expect(onPage).toHaveBeenCalledWith(2)
  })

  it('calls onPage with page+1 when Next is clicked', async () => {
    const user = userEvent.setup()
    const onPage = vi.fn()
    render(<Pagination page={3} totalPages={5} onPage={onPage} />)
    await user.click(screen.getByText('Next →'))
    expect(onPage).toHaveBeenCalledWith(4)
  })
})
