import {
  configureLoggerFromEnv,
  getLogLevel,
  logger,
  resolveLogLevel,
  setLogLevel,
} from './logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * P11 — le logger serveur n'avait AUCUN filtre de niveau : 239 `logger.info` + 27
 * `logger.debug` étaient émis en production, à chaque requête, vers `wrangler tail` et
 * logpush (stockage tiers durable et facturé). Le seuil ci-dessous coupe à la source.
 */
const sinks = () => ({
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
});

afterEach(() => {
  vi.restoreAllMocks();
  setLogLevel('debug');
});

describe('resolveLogLevel', () => {
  it('défaut `info` en production', () => {
    expect(resolveLogLevel({ NODE_ENV: 'production' })).toBe('info');
  });

  it('défaut `debug` en local et en staging', () => {
    expect(resolveLogLevel({ NODE_ENV: 'local' })).toBe('debug');
    expect(resolveLogLevel({ NODE_ENV: 'development' })).toBe('debug');
    expect(resolveLogLevel({})).toBe('debug');
  });

  it('LOG_LEVEL explicite l’emporte, insensible à la casse et aux espaces', () => {
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toBe('debug');
    expect(resolveLogLevel({ NODE_ENV: 'local', LOG_LEVEL: ' WARN ' })).toBe('warn');
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'error' })).toBe('error');
  });

  it('une valeur invalide retombe sur le défaut plutôt que de tout couper', () => {
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'verbose' })).toBe('info');
    expect(resolveLogLevel({ NODE_ENV: 'local', LOG_LEVEL: '' })).toBe('debug');
  });
});

describe('seuil appliqué à l’émission', () => {
  it('en production, `debug` n’est plus émis, `info` et au-dessus le restent', () => {
    const s = sinks();
    configureLoggerFromEnv({ NODE_ENV: 'production' });

    logger.debug('bruit');
    logger.info('utile');
    logger.warn('attention');
    logger.error('panne');

    expect(s.debug).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.warn).toHaveBeenCalledTimes(1);
    expect(s.error).toHaveBeenCalledTimes(1);
  });

  it('en local, tout passe', () => {
    const s = sinks();
    configureLoggerFromEnv({ NODE_ENV: 'local' });

    logger.debug('bruit');
    logger.info('utile');

    expect(s.debug).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledTimes(1);
  });

  it('LOG_LEVEL=error ne laisse passer que les erreurs', () => {
    const s = sinks();
    configureLoggerFromEnv({ NODE_ENV: 'production', LOG_LEVEL: 'error' });

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(s.debug).not.toHaveBeenCalled();
    expect(s.log).not.toHaveBeenCalled();
    expect(s.warn).not.toHaveBeenCalled();
    expect(s.error).toHaveBeenCalledTimes(1);
  });

  it('une entrée filtrée ne coûte AUCUNE sérialisation', () => {
    configureLoggerFromEnv({ NODE_ENV: 'production' });
    const exploding = {
      get boom() {
        throw new Error('ne doit jamais être lu');
      },
    };
    expect(() => logger.debug('x', exploding)).not.toThrow();
  });

  it('`error` reste toujours visible, quel que soit le seuil', () => {
    const s = sinks();
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      setLogLevel(level);
      logger.error('panne');
    }
    expect(s.error).toHaveBeenCalledTimes(4);
  });

  it('getLogLevel reflète la configuration appliquée', () => {
    configureLoggerFromEnv({ NODE_ENV: 'production' });
    expect(getLogLevel()).toBe('info');
    configureLoggerFromEnv({ NODE_ENV: 'local' });
    expect(getLogLevel()).toBe('debug');
  });
});
