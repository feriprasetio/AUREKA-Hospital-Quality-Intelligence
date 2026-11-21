import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CERTIFICATE_ELEMENTS,
  defaultCertificateLayout,
  normalizeCertificateLayout,
  pdfPoint,
} from '../lib/aureka/certificate-template.ts'

test('default certificate layouts include every movable element in normalized coordinates', () => {
  for (const key of ['in_house_training', 'student_orientation']) {
    const layout = defaultCertificateLayout(key)
    assert.equal(Object.keys(layout).length, CERTIFICATE_ELEMENTS.length)
    for (const point of Object.values(layout)) {
      assert.ok(point.x >= 2 && point.x <= 98)
      assert.ok(point.y >= 2 && point.y <= 98)
    }
  }
})

test('saved positions are normalized and out-of-range values are clamped', () => {
  const layout = normalizeCertificateLayout({
    title: { x: 150, y: -10 },
    recipient_name: { x: 42.5, y: 50.5 },
    unknown: { x: 50, y: 50 },
  }, 'in_house_training')
  assert.deepEqual(layout.title, { x: 98, y: 2 })
  assert.deepEqual(layout.recipient_name, { x: 42.5, y: 50.5 })
  assert.ok(layout.footer.x > 0)
})

test('PDF point maps normalized top-left coordinates to landscape PDF coordinates', () => {
  const layout = defaultCertificateLayout('in_house_training')
  assert.deepEqual(pdfPoint(layout, 'title', { x: 421, y: 440 }), { x: 421, y: 446 })
})
