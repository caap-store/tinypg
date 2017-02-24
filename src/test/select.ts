import * as H from './helper'
import { TinyPg } from '../'
import * as T from '../types'
import { expect } from 'chai'

describe('Tiny', () => {
   let tiny: TinyPg

   beforeEach(() => {
      tiny = H.newTiny()

      return H.setUpDb()
      .then(() => {
         return ['a', 'b', 'c'].reduce((chain, v) => {
            return chain.then<any>(() => H.insertA(v))
         }, Promise.resolve())
      })
   })

   describe('SQL file queries', () => {
      it('should return the postgres modules result', () => {
         return tiny.sql('a.select')
         .then(res => {
            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      it('should isolate if asked', () => {
         const iso = tiny.isolatedEmitter()

         let onQueryDataA
         let onResultDataA
         let onQueryDataB
         let onResultDataB

         tiny.events.on('query', e => { onQueryDataA = e })

         tiny.events.on('result', e => { onResultDataA = e })

         iso.events.on('query', e => { onQueryDataB = e })

         iso.events.on('result', e => { onResultDataB = e })

         return iso.sql('a.select')
         .then(res => {
            expect(onQueryDataA).to.not.exist
            expect(onResultDataA).to.not.exist

            expect(onQueryDataB).to.exist
            expect(onResultDataB).to.exist

            iso.dispose()

            tiny.events.removeAllListeners()

            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      it('should emit events', () => {
         let onQueryData
         let onResultData

         tiny.events.on('query', e => { onQueryData = e })

         tiny.events.on('result', e => { onResultData = e })

         return tiny.sql('a.select')
         .then(res => {
            expect(onQueryData).not.to.be.null
            expect(onResultData).not.to.be.null

            expect(onQueryData.name).to.equal('a_select')
            expect(onQueryData.duration).to.be.least(0)

            tiny.events.removeAllListeners()

            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      describe('that have format parameters', () => {
         it('should perform the replacements', () => {
            return tiny.formattable('a.testFormat')
            .format('a')
            .query({ a: 'a' })
            .then(res => {
               expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }])
            })
         })
      })

      describe('that have nested parameters', () => {
         it('should perform the replacements', () => {
            return tiny.sql('a.testNested', { a: { foo: 'a' } })
            .then(res => {
               expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }])
            })
         })
      })

      describe('that have missing parameters', () => {
         it('should perform the replacements', () => {
            return tiny.sql('a.testMissingParams', { a: 'a' })
            .catch(err => {
               expect(err).to.be.instanceof(T.TinyPgError)
               expect(err).to.have.property('queryContext')
               expect(err.message).to.include('this_is_the_missing_param')
            })
         })
      })

      describe('that have format parameters that inject variables', () => {
         it('should perform the replacements', () => {
            return tiny.formattable('a.testMultiFormat')
            .format(`__tiny_test_db.a WHERE text = :a OR text = :b`)
            .query({ a: 'a', b: 'b' })
            .then(res => {
               expect(res.rows).to.deep.equal([
                  { id: 1, text: 'a' },
                  { id: 2, text: 'b' },
               ])
            })
         })
      })

      describe('that perform multiple formats', () => {
         it('should perform the replacements', () => {
            return tiny.formattable('a.testMultiFormat')
            .format(`__tiny_test_db.a WHERE text = %L`)
            .format('a')
            .query()
            .then(res => {
               expect(res.rows).to.deep.equal([{ id: 1, text: 'a' }])
            })
         })
      })

      describe('that throws an error', () => {
         it('should wrap the error with the queryContext', () => {
            return tiny.sql('a.queryWithError')
            .catch(err => {
               expect(err).to.be.instanceof(T.TinyPgError)
               expect(err).to.have.property('queryContext')
               expect(err.queryContext).to.not.have.property('context')
               expect(err.queryContext.error.code).to.equal('42P01')
               expect(err.message).to.include('blah_doesnt_exist')
            })
         })

         it('should have the correct stack trace', () => {
            const thisShouldBeInStack = () => {
               return tiny.sql('a.queryWithError')
               .catch(err => {
                  expect(err.stack).to.include('thisShouldBeInStack')
               })
            }

            return thisShouldBeInStack()
         })
      })
   })

   describe('Raw queries', () => {
      it('should return the postgres modules result', () => {
         return tiny.query('SELECT * FROM __tiny_test_db.a')
         .then(res => {
            expect(res.rows).to.deep.equal([
               { id: 1, text: 'a' },
               { id: 2, text: 'b' },
               { id: 3, text: 'c' },
            ])
         })
      })

      describe('When an error is thrown', () => {
         it('should have appropriate metadata', () => {
            return tiny.query('SELECT THIS_WILL_THROW_ERROR;')
            .catch(err => {
               expect(err).to.be.instanceof(T.TinyPgError)
               expect(err).to.have.property('queryContext')
               expect(err.queryContext.error.code).to.equal('42703')
               expect(err.queryContext).to.not.have.property('context')
               expect(err.message).to.include('does not exist')
            })
         })

         it('should have the correct stack trace', () => {
            const thisShouldBeInStack = () => {
               return tiny.query('SELECT THIS_WILL_THROW_ERROR;')
               .catch(err => {
                  expect(err.stack).to.include('thisShouldBeInStack')
               })
            }

            return thisShouldBeInStack()
         })
      })
   })

   it('should allow creating an instance of tiny without directory', () => {
      const tiny = new TinyPg({
         connection_string: H.connection_string,
      })

      return tiny.query('SELECT 1 as x')
      .then(res => {
         expect(res.rows).to.deep.equal([{ x: 1 }])
      })
   })

   it('should transform errors', () => {
      const expectedError = { foo: 'bar' }

      const tiny = new TinyPg({
         connection_string: H.connection_string,
         error_transformer: () => {
            return expectedError
         },
      })

      return tiny.query('SELECT THIS_WILL_THROW_ERROR;')
      .catch(err => {
         expect(err).to.deep.equal(expectedError)
      })
   })
})
