import { AlertTriangle, X } from 'lucide-react'

interface ErrorDialogProps { message: string; onClose: () => void }

export function ErrorDialog({ message, onClose }: ErrorDialogProps) {
  if (!message) return null
  return <div className="modal-backdrop error-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title" aria-describedby="error-dialog-message">
      <div className="modal-header"><div><span className="section-icon error-icon"><AlertTriangle size={18} /></span><h2 id="error-dialog-title">操作失败</h2></div><button className="icon-button" type="button" onClick={onClose} title="关闭"><X size={20} /></button></div>
      <p id="error-dialog-message">{message}</p>
      <div className="modal-actions"><button type="button" className="button-primary" onClick={onClose}>知道了</button></div>
    </section>
  </div>
}
