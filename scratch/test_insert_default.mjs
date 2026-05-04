
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co'
const supabaseAnonKey = 'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testInsert() {
  console.log('Testing insert to Supabase patients table with default date...')
  const testPatient = {
    first_name: 'Test',
    last_name: 'Patient Default Date',
    birth_date: '1900-01-01',
    status: 'Activo'
  }
  
  const { data, error } = await supabase
    .from('patients')
    .insert(testPatient)
    .select()

  if (error) {
    console.error('Insert error:', error.message, error.details, error.hint)
    process.exit(1)
  }

  console.log('Insert successful!')
  console.log('Inserted data:', data)
  
  // Cleanup
  const id = data[0].id
  console.log(`Cleaning up test patient ${id}...`)
  await supabase.from('patients').delete().eq('id', id)
}

testInsert()
