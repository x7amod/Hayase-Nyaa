# Hayase Nyaa Extension

***This extension is AI Made*** (I don't have enough time to maintain it myself instead of using AI nor am I willing)

## Installation

Open Hayase and paste this URL into **Settings → Extensions → Repositories**:

```
https://raw.githubusercontent.com/x7amod/Hayase-Nyaa/main/index.json
```

## Development

### Prerequisites

- Node.js 18+

### Commands

```bash
npm test                # Run unit tests (offline, CI-safe)
npm run test:integration # Run live Nyaa tests
npm run test:all        # Run everything
```

### Project Structure

```
hayase/
  nyaasi.js       # Nyaa torrent source extension
  index.json      # Hayase manifest
test/
  unit/           # Offline unit tests (runs in CI)
  integration/    # Live network tests (skipped in CI)
  helpers/        # Shared test utilities
  fixtures/       # Test fixture data
docs/
  memory.md       # Current architecture and search behavior
```

### Adding a Test

Create a file in `test/unit/` following this pattern:

```js
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { yourFunction } = getInternals()

describe('yourFunction', () => {
  it('does something', () => {
    assert.strictEqual(yourFunction('input'), 'expected')
  })
})
```

It's automatically picked up by `npm test`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
